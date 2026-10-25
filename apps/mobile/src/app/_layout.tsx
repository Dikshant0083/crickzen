import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../auth';
import { migrate } from '../db';
import { C } from '../theme';

export default function Layout() {
  return (
    <AuthProvider>
      <SQLiteProvider databaseName="criczen.db" onInit={migrate}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
            headerTitleStyle: { fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new" options={{ title: 'New match' }} />
          <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
          <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
          <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
          <Stack.Screen name="tournament/new" options={{ title: 'New tournament' }} />
          <Stack.Screen name="tournament/[id]" options={{ title: 'Tournament' }} />
          <Stack.Screen name="auth/login" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen
            name="auth/register"
            options={{ title: 'Create account', presentation: 'modal' }}
          />
        </Stack>
      </SQLiteProvider>
    </AuthProvider>
  );
}
