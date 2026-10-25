import { describe, expect, it } from 'vitest';
import { ApiError, createSession, type Storage } from '../src/session';

const user = { id: 'u1', name: 'Rahul', mobile: '9876543210', username: 'rahul', createdAt: '' };

function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

/** A fake API: access tokens a1, a2…; refresh tokens r1, r2…; counts refreshes. */
function server(opts: { refreshStatus?: number; offline?: boolean } = {}) {
  let n = 1;
  const calls: string[] = [];
  const tokens = () => ({ user, accessToken: `a${n}`, refreshToken: `r${n}` });
  const fake = (async (url: string, init?: RequestInit) => {
    const path = url.replace('http://api', '');
    calls.push(path);
    if (opts.offline === true) throw new TypeError('Network request failed');
    if (path === '/auth/login') return json(200, tokens());
    if (path === '/auth/refresh') {
      if (opts.refreshStatus !== undefined)
        return json(opts.refreshStatus, { code: 'INVALID_TOKEN', message: 'Sign in again' });
      n += 1;
      return json(200, tokens());
    }
    if (path === '/auth/logout') return json(204, null);
    const auth = (init?.headers as Record<string, string> | undefined)?.['authorization'];
    // Only the newest access token is accepted.
    return auth === `Bearer a${n}` ? json(200, user) : json(401, { code: 'UNAUTHENTICATED' });
  }) as typeof fetch;
  return { fake, calls };
}

describe('session', () => {
  it('shares one refresh between concurrent calls, so the server never sees a reused token', async () => {
    const s = server();
    const storage = memory();
    storage.data.set('refreshToken', 'r1');
    const session = createSession({ baseUrl: 'http://api', storage, fetch: s.fake });

    // No access token in memory yet (app just started): three screens ask at once.
    await Promise.all([
      session.updateProfile({}),
      session.updateProfile({}),
      session.updateProfile({}),
    ]);
    expect(s.calls.filter((c) => c === '/auth/refresh')).toHaveLength(1);
    expect(storage.data.get('refreshToken')).toBe('r2');
  });

  it('signs out when the server rejects the refresh token, but not when offline', async () => {
    const rejected = memory();
    rejected.data.set('refreshToken', 'r1');
    const a = createSession({
      baseUrl: 'http://api',
      storage: rejected,
      fetch: server({ refreshStatus: 401 }).fake,
    });
    await expect(a.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(rejected.data.has('refreshToken')).toBe(false);

    const offline = memory();
    offline.data.set('refreshToken', 'r1');
    const b = createSession({
      baseUrl: 'http://api',
      storage: offline,
      fetch: server({ offline: true }).fake,
    });
    await expect(b.refresh()).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(offline.data.get('refreshToken')).toBe('r1');
  });

  it('signs the device out even when the server cannot be reached', async () => {
    const storage = memory();
    const online = createSession({ baseUrl: 'http://api', storage, fetch: server().fake });
    await online.signIn('rahul', 'pw');
    expect(await online.cachedUser()).toMatchObject({ name: 'Rahul' });

    const offline = createSession({
      baseUrl: 'http://api',
      storage,
      fetch: server({ offline: true }).fake,
    });
    await offline.signOut();
    expect(await offline.cachedUser()).toBeNull();
    expect(storage.data.size).toBe(0);
  });
});
