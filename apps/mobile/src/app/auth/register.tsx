import { isValidMobile, normalizeMobile } from '@criczen/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../auth';
import { ApiError } from '../../session';
import { C } from '../../theme';
import { Button, Field, text } from '../../ui';

export default function Register() {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const number = normalizeMobile(mobile);
    // The server checks all of this too; these just answer faster.
    if (name.trim() === '') return setError('Enter your name.');
    if (number === null || !isValidMobile(number))
      return setError('Mobile number should have 10 digits.');
    if (username.trim() !== '' && !/^[a-z0-9_]{3,20}$/i.test(username.trim())) {
      return setError('Username: 3–20 letters, digits or _.');
    }
    if (password.length < 8) return setError('Password needs at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      await auth.signUp({
        name: name.trim(),
        mobile: number,
        ...(username.trim() === '' ? {} : { username: username.trim() }),
        password,
      });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={text.h1}>Create your account</Text>
      <Text style={text.muted}>Your number is never shown to other users.</Text>
      <Field
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rahul Kumar"
        autoFocus
      />
      <Field
        label="Mobile number"
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
        plain
      />
      <Field
        label="Username (optional)"
        value={username}
        onChangeText={setUsername}
        placeholder="e.g. rahul_k"
        hint="You can sign in with it. Letters, digits and _."
        plain
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        hint="At least 8 characters."
      />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secure />
      {error !== null && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <Button
        label={busy ? 'Creating…' : 'Create account'}
        icon="person-add"
        variant="primary"
        size="lg"
        disabled={busy}
        onPress={submit}
      />
      <Button
        label="Already have an account? Sign in"
        variant="ghost"
        onPress={() => router.replace('/auth/login')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 16, paddingBottom: 48 },
  error: { color: C.wicket, fontWeight: '700' },
});
