import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { type Database, openDatabase } from '../src/db.js';
import { assertLocalDatabase, DEMO_PASSWORD, demoAccounts, seedDemo } from '../src/seed.js';

let database: Database;
beforeEach(async () => {
  database = await openDatabase();
});
afterEach(async () => {
  await database.close();
});

describe('seedDemo', () => {
  it('adds every demo account once, each able to sign in', async () => {
    expect(await seedDemo(database.db)).toBe(demoAccounts().length);
    expect(await seedDemo(database.db)).toBe(0);

    const app = await buildApp({
      db: database.db,
      jwtSecret: new TextEncoder().encode('test-secret-test-secret-test-secret!'),
      rateLimit: false,
    });
    const login = (identifier: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier, password: DEMO_PASSWORD },
      });
    expect((await login('9000000001')).json().user.name).toBe('Aarav Sharma');
    expect((await login('test_scorer')).statusCode).toBe(200);
    await app.close();
  });
});

describe('assertLocalDatabase', () => {
  it('allows only this machine, never production', () => {
    expect(() => assertLocalDatabase(undefined, undefined)).not.toThrow();
    expect(() =>
      assertLocalDatabase('postgres://u:p@localhost:5433/criczen', 'development'),
    ).not.toThrow();
    expect(() => assertLocalDatabase('postgres://u:p@ep-x-pooler.neon.tech/db', undefined)).toThrow(
      /local/,
    );
    expect(() => assertLocalDatabase('postgres://u:p@localhost/db', 'production')).toThrow(
      /production/,
    );
  });
});
