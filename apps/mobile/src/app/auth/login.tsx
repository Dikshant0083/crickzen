import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../auth';
import { ApiError } from '../../session';
import { C } from '../../theme';
import { Button, Field, text } from '../../ui';

export default function Login() {
  const auth = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (identifier.trim() === '' || password === '')
      return setError('Enter your mobile number or username, and password.');
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(identifier.trim(), password);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>Welcome back</Text>
      <Field
        label="Mobile number or username"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="e.g. 9876543210 or rahul_k"
        plain
        autoFocus
      />
      <Field label="Password" value={password} onChangeText={setPassword} secure />
      {error !== null && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <Button
        label={busy ? 'Signing in…' : 'Sign in'}
        icon="log-in"
        variant="primary"
        size="lg"
        disabled={busy}
        onPress={submit}
      />
      <Button
        label="New here? Create an account"
        variant="ghost"
        onPress={() => router.replace('/auth/register')}
      />
      <Text style={text.muted}>Forgot your password? Reset by SMS code is coming soon.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 16 },
  error: { color: C.wicket, fontWeight: '700' },
});
