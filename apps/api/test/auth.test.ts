import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { type Database, openDatabase } from '../src/db.js';

const secret = new TextEncoder().encode('test-secret-test-secret-test-secret!');
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  database = await openDatabase(); // in-memory PGlite, migrated
  app = await buildApp({ db: database.db, jwtSecret: secret, rateLimit: false });
});

afterEach(async () => {
  await app.close();
  await database.close();
});

const post = (url: string, payload: object, token?: string) =>
  app.inject({
    method: 'POST',
    url,
    payload,
    ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });
const me = (token: string) =>
  app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });

const rahul = {
  name: 'Rahul Kumar',
  mobile: '+91 98765-43210',
  username: 'Rahul_K',
  password: 'correct horse',
};

describe('register and login', () => {
  it('registers with a normalised mobile, stores an argon2id hash, and signs in either way', async () => {
    const res = await post('/auth/register', rahul);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({
      name: 'Rahul Kumar',
      mobile: '9876543210',
      username: 'rahul_k',
    });
    expect(JSON.stringify(body)).not.toContain('password');

    const [row] = await database.db.query.users.findMany();
    expect(row?.passwordHash.startsWith('$argon2id$')).toBe(true);

    expect((await me(body.accessToken)).json().id).toBe(body.user.id);
    expect(
      (await post('/auth/login', { identifier: '9876543210', password: 'correct horse' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('/auth/login', { identifier: 'RAHUL_K', password: 'correct horse' })).statusCode,
    ).toBe(200);
  });

  it('refuses a second account on the same number or username', async () => {
    await post('/auth/register', rahul);
    const sameMobile = await post('/auth/register', {
      ...rahul,
      mobile: '9876543210',
      username: 'other',
    });
    expect(sameMobile.statusCode).toBe(409);
    expect(sameMobile.json().code).toBe('MOBILE_TAKEN');
    const sameName = await post('/auth/register', {
      ...rahul,
      mobile: '9000000001',
      username: 'RAHUL_k',
    });
    expect(sameName.json().code).toBe('USERNAME_TAKEN');
  });

  it('gives the same answer for an unknown user and a wrong password', async () => {
    await post('/auth/register', rahul);
    const wrong = await post('/auth/login', { identifier: 'rahul_k', password: 'nope nope' });
    const unknown = await post('/auth/login', { identifier: 'nobody', password: 'nope nope' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('rejects bad input with 400, not 500', async () => {
    expect((await post('/auth/register', { ...rahul, mobile: '12345' })).statusCode).toBe(400);
    expect((await post('/auth/register', { ...rahul, password: 'short' })).statusCode).toBe(400);
    expect((await post('/auth/register', { ...rahul, username: 'no spaces!' })).statusCode).toBe(
      400,
    );
  });

  it('rejects a tampered or missing access token', async () => {
    const { accessToken } = (await post('/auth/register', rahul)).json();
    expect((await me(`${accessToken}x`)).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
  });
});

describe('refresh tokens', () => {
  it('rotates on every use', async () => {
    const first = (await post('/auth/register', rahul)).json();
    const second = (await post('/auth/refresh', { refreshToken: first.refreshToken })).json();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await post('/auth/refresh', { refreshToken: second.refreshToken })).statusCode).toBe(
      200,
    );
  });

  it('treats a reused token as stolen and signs out the whole family', async () => {
    const first = (await post('/auth/register', rahul)).json();
    const second = (await post('/auth/refresh', { refreshToken: first.refreshToken })).json();

    const replay = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('TOKEN_REUSED');
    // The legitimate holder's newer token dies with the family.
    expect((await post('/auth/refresh', { refreshToken: second.refreshToken })).statusCode).toBe(
      401,
    );
  });

  it('only stores hashes', async () => {
    const { refreshToken } = (await post('/auth/register', rahul)).json();
    const rows = await database.db.query.refreshTokens.findMany();
    expect(rows.some((r) => r.tokenHash === refreshToken)).toBe(false);
  });

  it('logout ends the session', async () => {
    const { refreshToken } = (await post('/auth/register', rahul)).json();
    expect((await post('/auth/logout', { refreshToken })).statusCode).toBe(204);
    expect((await post('/auth/refresh', { refreshToken })).statusCode).toBe(401);
  });
});

describe('profile', () => {
  it('lets a user change only their own name and username', async () => {
    const { accessToken } = (await post('/auth/register', rahul)).json();
    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Rahul K', username: 'rk_bat' },
    });
    expect(res.json()).toMatchObject({ name: 'Rahul K', username: 'rk_bat', mobile: '9876543210' });
  });

  it('deleting the account anonymises it and ends every session', async () => {
    const { accessToken, refreshToken } = (await post('/auth/register', rahul)).json();
    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    expect((await me(accessToken)).statusCode).toBe(401);
    expect((await post('/auth/refresh', { refreshToken })).statusCode).toBe(401);
    expect(
      (await post('/auth/login', { identifier: '9876543210', password: 'correct horse' }))
        .statusCode,
    ).toBe(401);
    const [row] = await database.db.query.users.findMany();
    expect(row).toMatchObject({ name: 'Deleted user', mobile: null, username: null });

    // The number is free again for its real owner.
    expect((await post('/auth/register', { ...rahul, username: 'rahul2' })).statusCode).toBe(201);
  });
});

describe('rate limits', () => {
  it('locks out repeated logins for one identifier', async () => {
    const limited = await buildApp({ db: database.db, jwtSecret: secret });
    const attempt = () =>
      limited.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: 'rahul_k', password: 'guess guess' },
      });
    for (let i = 0; i < 10; i += 1) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
    await limited.close();
  });

  it('counts every way of writing one number against the same budget', async () => {
    const limited = await buildApp({ db: database.db, jwtSecret: secret });
    const formats = ['9876543210', '+91 98765 43210', '098765-43210', '(987) 654 3210'];
    const attempt = (identifier: string) =>
      limited.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier, password: 'guess guess' },
      });
    for (let i = 0; i < 10; i += 1) await attempt(formats[i % formats.length] ?? '');
    expect((await attempt('+919876543210')).statusCode).toBe(429);
    await limited.close();
  });
});
