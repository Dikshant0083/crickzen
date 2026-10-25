import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth';
import { initials, maskMobile } from '../../people';
import { ApiError } from '../../session';
import { C, radius } from '../../theme';
import { Button, Card, Field, text } from '../../ui';

export default function Me() {
  const auth = useAuth();
  const { user } = auth;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');

  if (user === undefined) return <ActivityIndicator style={{ padding: 24 }} color={C.accent} />;

  if (user === null) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <LinearGradient colors={[`${C.accent}55`, C.surface]} style={styles.hero}>
          <Ionicons name="person-circle" size={56} color={C.accent} />
          <Text style={text.h1}>Your cricket profile</Text>
          <Text style={text.muted}>
            Sign in to own your matches and tournaments, and to keep your stats when you change
            phones.
          </Text>
        </LinearGradient>
        {!auth.configured && (
          <Card title="Server not set up">
            <Text style={text.muted}>
              Set EXPO_PUBLIC_API_URL in apps/mobile/.env.local and restart Expo to enable sign-in.
            </Text>
          </Card>
        )}
        <Button
          label="Sign in"
          icon="log-in"
          variant="primary"
          size="lg"
          disabled={!auth.configured}
          onPress={() => router.push('/auth/login')}
        />
        <Button
          label="Create an account"
          icon="person-add"
          variant="ghost"
          disabled={!auth.configured}
          onPress={() => router.push('/auth/register')}
        />
        <Text style={text.muted}>Scoring works without an account, and offline.</Text>
      </ScrollView>
    );
  }

  const startEdit = () => {
    setName(user.name);
    setUsername(user.username ?? '');
    setEditing(true);
  };

  const save = async () => {
    try {
      await auth.updateProfile({
        name: name.trim(),
        username: username.trim() === '' ? null : username.trim(),
      });
      setEditing(false);
    } catch (e) {
      Alert.alert('Not saved', e instanceof ApiError ? e.message : String(e));
    }
  };

  const signOut = () =>
    Alert.alert('Sign out?', 'Your matches stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => auth.signOut() },
    ]);

  const remove = () =>
    Alert.alert(
      'Delete your account?',
      'Your name and number are erased and you are signed out everywhere. Scorecards you played in are kept, without your details. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            auth
              .deleteAccount()
              .catch((e: unknown) =>
                Alert.alert('Not deleted', e instanceof ApiError ? e.message : String(e)),
              ),
        },
      ],
    );

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <LinearGradient colors={[`${C.accent}55`, C.surface]} style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials(user.name)}</Text>
        </View>
        <Text style={text.h1}>{user.name}</Text>
        {user.username !== null && <Text style={styles.handle}>@{user.username}</Text>}
        <Text style={text.muted}>
          {maskMobile(user.mobile)} · since {new Date(user.createdAt).toLocaleDateString()}
        </Text>
      </LinearGradient>

      {editing ? (
        <Card title="Edit profile">
          <Field label="Name" value={name} onChangeText={setName} />
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            plain
            hint="Leave empty to remove it."
          />
          <View style={styles.row}>
            <Button label="Cancel" style={styles.flex} onPress={() => setEditing(false)} />
            <Button
              label="Save"
              icon="checkmark"
              variant="primary"
              style={styles.flex}
              onPress={save}
            />
          </View>
        </Card>
      ) : (
        <Button label="Edit profile" icon="create" onPress={startEdit} />
      )}

      <Button label="Sign out" icon="log-out" variant="ghost" onPress={signOut} />
      <Button label="Delete account" icon="trash" variant="ghost" onPress={remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 48 },
  hero: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 6,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  initials: { color: C.onAccent, fontSize: 28, fontWeight: '900' },
  handle: { color: C.accent, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
