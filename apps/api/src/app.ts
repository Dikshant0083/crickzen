import { normalizeMobile } from '@criczen/shared';
import rateLimit from '@fastify/rate-limit';
import { and, eq, isNull } from 'drizzle-orm';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  hashPassword,
  hashToken,
  newRefreshToken,
  REFRESH_TTL_MS,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from './auth.js';
import type { Db } from './db.js';
import { refreshTokens, users } from './schema.js';

export interface AppOptions {
  db: Db;
  jwtSecret: Uint8Array;
  /** Off in most tests; on everywhere else. */
  rateLimit?: boolean;
  logger?: boolean;
}

const mobile = z.string().transform((s, ctx) => {
  const m = normalizeMobile(s);
  if (m === null || m.length !== 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Mobile number must have 10 digits' });
    return z.NEVER;
  }
  return m;
});
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, '3–20 letters, digits or _');
const name = z.string().trim().min(1).max(60);
const password = z.string().min(8, 'At least 8 characters').max(128);

const registerBody = z.object({ name, mobile, username: username.optional(), password });
const loginBody = z.object({
  identifier: z.string().trim().min(1).max(64),
  password: z.string().max(128),
});
const tokenBody = z.object({ refreshToken: z.string().min(1).max(200) });
const updateBody = z.object({ name: name.optional(), username: username.nullable().optional() });

type User = typeof users.$inferSelect;

function publicUser(u: User) {
  return { id: u.id, name: u.name, mobile: u.mobile, username: u.username, createdAt: u.createdAt };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(e: unknown, constraint: string): boolean {
  // postgres-js and PGlite both surface Postgres's SQLSTATE and constraint name, possibly wrapped.
  for (let cur: unknown = e; cur instanceof Object; cur = (cur as { cause?: unknown }).cause) {
    const err = cur as { code?: string; constraint?: string; constraint_name?: string };
    if (err.code === UNIQUE_VIOLATION) {
      return (err.constraint ?? err.constraint_name ?? '').includes(constraint);
    }
  }
  return false;
}

export async function buildApp(options: AppOptions) {
  const { db, jwtSecret } = options;
  const app = Fastify({ logger: options.logger ?? false, trustProxy: true });

  await app.register(rateLimit, { global: false });
  // Strict, per identifier on the auth routes (§5.3): an attacker rotating IPs still hits the account's limit.
  const strict = (max: number) =>
    options.rateLimit === false
      ? {}
      : {
          config: {
            rateLimit: {
              max,
              timeWindow: '15 minutes',
              keyGenerator: (req: FastifyRequest) => {
                const body = req.body as { identifier?: unknown; mobile?: unknown } | undefined;
                const who = body?.identifier ?? body?.mobile;
                if (typeof who !== 'string') return `ip:${req.ip}`;
                // "+91 98765-43210" and "9876543210" must share one budget.
                const digits = /^[\d\s+()-]+$/.test(who) ? normalizeMobile(who) : null;
                return `id:${digits ?? who.trim().toLowerCase()}`;
              },
            },
          },
        };

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ code: 'INVALID_INPUT', message: error.issues[0]?.message ?? 'Invalid input' });
    }
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ code: error.code, message: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429)
      return reply
        .status(429)
        .send({ code: 'RATE_LIMITED', message: 'Too many attempts, try later' });
    app.log.error(error);
    return reply.status(500).send({ code: 'INTERNAL', message: 'Something went wrong' });
  });

  async function issueTokens(userId: string, familyId: string, req: FastifyRequest) {
    const refresh = newRefreshToken();
    await db.insert(refreshTokens).values({
      userId,
      tokenHash: refresh.hash,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      createdIp: req.ip,
      createdUa: req.headers['user-agent']?.slice(0, 200) ?? null,
    });
    return { accessToken: await signAccessToken(userId, jwtSecret), refreshToken: refresh.token };
  }

  async function revokeFamily(familyId: string) {
    await db
      .update(refreshTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.consumedAt)));
  }

  /** The signed-in, not-deleted user. Authorisation reads the database, never token claims (§5.3). */
  async function currentUser(req: FastifyRequest): Promise<User> {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const id = token === '' ? null : await verifyAccessToken(token, jwtSecret);
    const [user] = id === null ? [] : await db.select().from(users).where(eq(users.id, id));
    if (user === undefined || user.deletedAt !== null) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in again');
    }
    return user;
  }

  app.post('/auth/register', strict(5), async (req, reply: FastifyReply) => {
    const body = registerBody.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    let user: User | undefined;
    try {
      [user] = await db
        .insert(users)
        .values({
          name: body.name,
          mobile: body.mobile,
          username: body.username ?? null,
          passwordHash,
        })
        .returning();
    } catch (e) {
      if (isUniqueViolation(e, 'mobile'))
        throw new HttpError(409, 'MOBILE_TAKEN', 'This mobile number already has an account');
      if (isUniqueViolation(e, 'username'))
        throw new HttpError(409, 'USERNAME_TAKEN', 'That username is taken');
      throw e;
    }
    if (user === undefined) throw new Error('insert returned nothing');
    const tokens = await issueTokens(user.id, crypto.randomUUID(), req);
    return reply.status(201).send({ user: publicUser(user), ...tokens });
  });

  app.post('/auth/login', strict(10), async (req) => {
    const body = loginBody.parse(req.body);
    const asMobile = normalizeMobile(body.identifier);
    const where =
      asMobile !== null && asMobile.length === 10 && /^[\d\s+()-]+$/.test(body.identifier)
        ? eq(users.mobile, asMobile)
        : eq(users.username, body.identifier.toLowerCase());
    const [user] = await db
      .select()
      .from(users)
      .where(and(where, isNull(users.deletedAt)));
    const ok = await verifyPassword(user?.passwordHash ?? null, body.password);
    // One answer for "no such user" and "wrong password", so accounts cannot be probed.
    if (user === undefined || !ok)
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong mobile/username or password');
    return { user: publicUser(user), ...(await issueTokens(user.id, crypto.randomUUID(), req)) };
  });

  app.post('/auth/refresh', strict(30), async (req) => {
    const { refreshToken } = tokenBody.parse(req.body);
    const tokenHash = hashToken(refreshToken);
    // Consume atomically: of two concurrent refreshes with one token, exactly one wins.
    const [row] = await db
      .update(refreshTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.consumedAt)))
      .returning();
    if (row === undefined) {
      const [used] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash));
      if (used !== undefined) {
        // A consumed token came back: it was copied. Kill the whole family (§5.3).
        await revokeFamily(used.familyId);
        throw new HttpError(401, 'TOKEN_REUSED', 'Signed out for safety, sign in again');
      }
      throw new HttpError(401, 'INVALID_TOKEN', 'Sign in again');
    }
    const [user] = await db.select().from(users).where(eq(users.id, row.userId));
    if (row.expiresAt.getTime() < Date.now() || user === undefined || user.deletedAt !== null) {
      throw new HttpError(401, 'INVALID_TOKEN', 'Sign in again');
    }
    return { user: publicUser(user), ...(await issueTokens(user.id, row.familyId, req)) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const { refreshToken } = tokenBody.parse(req.body);
    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)));
    if (row !== undefined) await revokeFamily(row.familyId);
    return reply.status(204).send();
  });

  app.get('/me', async (req) => publicUser(await currentUser(req)));

  app.patch('/me', async (req) => {
    const user = await currentUser(req);
    const body = updateBody.parse(req.body);
    try {
      const [updated] = await db
        .update(users)
        .set({
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.username === undefined ? {} : { username: body.username }),
        })
        .where(eq(users.id, user.id))
        .returning();
      return publicUser(updated ?? user);
    } catch (e) {
      if (isUniqueViolation(e, 'username'))
        throw new HttpError(409, 'USERNAME_TAKEN', 'That username is taken');
      throw e;
    }
  });

  /**
   * Deletion anonymises the account and signs every device out. Scorecards
   * are other people's record too, so match data is kept (§5.3).
   */
  app.delete('/me', async (req, reply) => {
    const user = await currentUser(req);
    await db
      .update(users)
      .set({
        name: 'Deleted user',
        mobile: null,
        username: null,
        passwordHash: '',
        deletedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await db
      .update(refreshTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.consumedAt)));
    return reply.status(204).send();
  });

  app.get('/health', async () => ({ ok: true }));

  return app;
}
