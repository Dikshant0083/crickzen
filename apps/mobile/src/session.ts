/**
 * Talking to the accounts API. Kept free of React Native imports so the
 * token rules are unit-tested: storage and fetch are passed in.
 */

export interface User {
  id: string;
  name: string;
  mobile: string | null;
  username: string | null;
  createdAt: string;
}

export interface Storage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const REFRESH = 'refreshToken';
const USER = 'user';

interface Tokens {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export function createSession(options: { baseUrl: string; storage: Storage; fetch: typeof fetch }) {
  const { baseUrl, storage } = options;
  let access: string | null = null;
  let refreshing: Promise<User | null> | null = null;

  async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    let res: Response;
    try {
      res = await options.fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
      });
    } catch {
      throw new ApiError(0, 'OFFLINE', 'Cannot reach the server. Check your connection.');
    }
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (!res.ok)
      throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? 'Something went wrong');
    return body as T;
  }

  async function keep(t: Tokens): Promise<User> {
    access = t.accessToken;
    await storage.set(REFRESH, t.refreshToken);
    await storage.set(USER, JSON.stringify(t.user));
    return t.user;
  }

  async function forget() {
    access = null;
    await storage.remove(REFRESH);
    await storage.remove(USER);
  }

  /**
   * Swaps the refresh token for a new pair. Single-flight: the server treats
   * a refresh token used twice as stolen and signs every device out, so
   * concurrent callers must share one request.
   */
  function refresh(): Promise<User | null> {
    refreshing ??= (async () => {
      try {
        const token = await storage.get(REFRESH);
        if (token === null) return null;
        try {
          return await keep(
            await request<Tokens>('/auth/refresh', {
              method: 'POST',
              body: JSON.stringify({ refreshToken: token }),
            }),
          );
        } catch (e) {
          // Only a definite "no" from the server signs out; being offline keeps the session.
          if (e instanceof ApiError && e.status === 401) await forget();
          throw e;
        }
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  /** An authenticated call that refreshes once on an expired access token. */
  async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (access === null) await refresh();
    if (access === null) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again');
    try {
      return await request<T>(path, init, access);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      await refresh();
      if (access === null) throw e;
      return request<T>(path, init, access);
    }
  }

  return {
    /** The last signed-in user, known even offline. */
    async cachedUser(): Promise<User | null> {
      const raw = await storage.get(USER);
      return raw === null ? null : (JSON.parse(raw) as User);
    },
    refresh,
    async signIn(identifier: string, password: string) {
      return keep(
        await request<Tokens>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        }),
      );
    },
    async signUp(input: { name: string; mobile: string; username?: string; password: string }) {
      return keep(
        await request<Tokens>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
      );
    },
    async signOut() {
      const token = await storage.get(REFRESH);
      await forget();
      // Best effort: the device is signed out even if the server cannot be told.
      if (token !== null) {
        await request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: token }),
        }).catch(() => {});
      }
    },
    async updateProfile(patch: { name?: string; username?: string | null }) {
      const user = await authed<User>('/me', { method: 'PATCH', body: JSON.stringify(patch) });
      await storage.set(USER, JSON.stringify(user));
      return user;
    },
    async deleteAccount() {
      await authed('/me', { method: 'DELETE' });
      await forget();
    },
  };
}

export type Session = ReturnType<typeof createSession>;
