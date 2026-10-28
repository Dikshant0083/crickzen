import type { LiveSnapshot } from '@criczen/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { type Database, openDatabase } from '../src/db.js';

const secret = new TextEncoder().encode('test-secret-test-secret-test-secret!');
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  database = await openDatabase();
  app = await buildApp({ db: database.db, jwtSecret: secret, rateLimit: false });
});

afterEach(async () => {
  await app.close();
  await database.close();
});

async function signUp(mobile: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { name: 'Scorer', mobile, password: 'correct horse' },
  });
  return res.json().accessToken as string;
}

const snapshot = (runs: number): LiveSnapshot => ({
  title: 'Strikers vs Royals',
  totalOvers: 20,
  result: null,
  innings: [
    {
      team: 'Strikers',
      runs,
      wickets: 1,
      overs: '2.3',
      target: null,
      batters: [
        { name: '<b>Rahul</b>', runs, balls: 10, fours: 1, sixes: 0, out: null, striker: true },
      ],
      bowlers: [{ name: 'Arjun', overs: '2.3', runs, wickets: 1 }],
      thisOver: ['1', '4', 'W'],
    },
  ],
});

const share = (token: string | undefined, matchId: string, body: unknown) =>
  app.inject({
    method: 'PUT',
    url: `/matches/${matchId}/live`,
    payload: body as object,
    ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });

describe('live share links', () => {
  it('creates a link, keeps it on later balls, and serves the latest score publicly', async () => {
    const token = await signUp('9876543210');
    const first = await share(token, 'm1', snapshot(12));
    expect(first.statusCode).toBe(200);
    const { code } = first.json();
    expect(code).toMatch(/^[\w-]{12}$/);

    const second = await share(token, 'm1', snapshot(19));
    expect(second.json().code).toBe(code);

    const data = await app.inject({ method: 'GET', url: `/l/${code}/data` });
    expect(data.statusCode).toBe(200);
    expect(data.json().snapshot.innings[0].runs).toBe(19);

    const page = await app.inject({ method: 'GET', url: `/l/${code}` });
    expect(page.headers['content-type']).toContain('text/html');
    // The page is static: nothing from the snapshot or URL is written into its HTML.
    expect(page.body).not.toContain('Rahul');
  });

  it('reads from the database when the cache is cold', async () => {
    const token = await signUp('9876543210');
    const { code } = (await share(token, 'm1', snapshot(30))).json();
    const fresh = await buildApp({ db: database.db, jwtSecret: secret, rateLimit: false });
    const data = await fresh.inject({ method: 'GET', url: `/l/${code}/data` });
    expect(data.json().snapshot.innings[0].runs).toBe(30);
    await fresh.close();
  });

  it('gives each scorer their own link for the same local match id', async () => {
    const a = (await share(await signUp('9876543210'), 'm1', snapshot(1))).json().code;
    const b = (await share(await signUp('9123456789'), 'm1', snapshot(2))).json().code;
    expect(a).not.toBe(b);
  });

  it('needs sign-in to share, rejects malformed snapshots, and 404s unknown codes', async () => {
    expect((await share(undefined, 'm1', snapshot(1))).statusCode).toBe(401);
    const token = await signUp('9876543210');
    expect((await share(token, 'm1', { ...snapshot(1), totalOvers: -1 })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/l/AAAAAAAAAAAA/data' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/l/bad' })).statusCode).toBe(400);
  });
});
