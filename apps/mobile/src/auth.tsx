import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { createSession, type Session, type User } from './session';

/** Set in apps/mobile/.env.local, e.g. EXPO_PUBLIC_API_URL=https://xyz.trycloudflare.com */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

interface Auth {
  /** Undefined while the stored session is read on start-up. */
  user: User | null | undefined;
  configured: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: Session['signUp'];
  signOut: () => Promise<void>;
  updateProfile: Session['updateProfile'];
  deleteAccount: () => Promise<void>;
  shareLive: Session['shareLive'];
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider(props: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const session = useMemo(
    () =>
      createSession({
        baseUrl: API_URL,
        // Keychain (iOS) / Keystore (Android), never plain storage (ARCHITECTURE §5.3).
        // shortcut: the web build (dev preview only) has no keychain, so it keeps tokens in sessionStorage; never ship a web build like this.
        storage:
          Platform.OS === 'web'
            ? {
                get: async (k) => sessionStorage.getItem(k),
                set: async (k, v) => sessionStorage.setItem(k, v),
                remove: async (k) => sessionStorage.removeItem(k),
              }
            : {
                get: (k) => SecureStore.getItemAsync(k),
                set: (k, v) => SecureStore.setItemAsync(k, v),
                remove: (k) => SecureStore.deleteItemAsync(k),
              },
        fetch,
      }),
    [],
  );

  useEffect(() => {
    // Show the cached user at once (works offline), then confirm with the server.
    session.cachedUser().then((cached) => {
      setUser(cached);
      if (cached !== null && API_URL !== '') {
        session.refresh().then(setUser, () => session.cachedUser().then(setUser));
      }
    });
  }, [session]);

  const value: Auth = {
    user,
    configured: API_URL !== '',
    signIn: async (identifier, password) => setUser(await session.signIn(identifier, password)),
    signUp: async (input) => {
      const u = await session.signUp(input);
      setUser(u);
      return u;
    },
    signOut: async () => {
      await session.signOut();
      setUser(null);
    },
    updateProfile: async (patch) => {
      const u = await session.updateProfile(patch);
      setUser(u);
      return u;
    },
    shareLive: (matchId, snapshot) => session.shareLive(matchId, snapshot),
    deleteAccount: async () => {
      await session.deleteAccount();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (auth === null) throw new Error('useAuth outside AuthProvider');
  return auth;
}
