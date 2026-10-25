import { DEMO_TEAMS, demoMobile } from '@criczen/shared';
import { hashPassword } from './auth.js';
import type { Db } from './db.js';
import { users } from './schema.js';

/** Every demo account signs in with this password. */
export const DEMO_PASSWORD = 'demo-pass-123';

export interface DemoAccount {
  name: string;
  mobile: string;
  username: string;
}

/** One account per demo player, plus a scorer account to sign in with first. */
export function demoAccounts(): DemoAccount[] {
  const players = DEMO_TEAMS.flatMap(([, names], t) =>
    names.map((name, i) => ({
      name,
      mobile: demoMobile(t, i),
      username: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    })),
  );
  return [{ name: 'Test Scorer', mobile: '9000000100', username: 'test_scorer' }, ...players];
}

/**
 * Seeding writes known passwords, so it only ever runs against a database on
 * this machine. Throws for anything else, including production.
 */
export function assertLocalDatabase(url: string | undefined, nodeEnv: string | undefined) {
  if (nodeEnv === 'production') throw new Error('Refusing to seed: NODE_ENV is production.');
  if (url === undefined || url === '') return; // embedded PGlite
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to seed ${host}: demo accounts go only into a local database.`);
  }
}

/** Idempotent: accounts whose mobile or username already exists are left alone. */
export async function seedDemo(db: Db): Promise<number> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const inserted = await db
    .insert(users)
    .values(demoAccounts().map((a) => ({ ...a, passwordHash })))
    .onConflictDoNothing()
    .returning({ id: users.id });
  return inserted.length;
}
