import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listPlayers, listTeams, loadAllMatches, type Player, saveTeam } from '../../db';
import { PlayerPicker } from '../../PlayerPicker';
import { maskMobile, ROLE } from '../../people';
import { type TeamRecord, teamRecord } from '../../stats';
import { C } from '../../theme';
import { Button, Card, Empty, Field, Stat } from '../../ui';

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [squad, setSquad] = useState<Player[]>([]);
  const [picking, setPicking] = useState(false);
  const [record, setRecord] = useState<TeamRecord | null>(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const team = (await listTeams(db)).find((t) => t.id === id);
      if (team === undefined) return;
      const players = await listPlayers(db);
      setName(team.name);
      setRecord(
        teamRecord(
          (await loadAllMatches(db)).map((m) => m.state),
          team.name,
        ),
      );
      setSquad(team.playerIds.flatMap((pid) => players.filter((p) => p.id === pid)));
    })();
  }, [db, id, isNew]);

  const toggle = (p: Player) =>
    setSquad((s) => (s.some((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [...s, p]));

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') return Alert.alert('Name needed', 'Give the team a name.');
    if (squad.length < 2) return Alert.alert('Add players', 'A team needs at least 2 players.');
    const problem = await saveTeam(db, {
      id: isNew ? randomUUID() : id,
      name: trimmed,
      playerIds: squad.map((p) => p.id),
    });
    if (problem !== null) return Alert.alert('Name taken', problem);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New team' : name || 'Team' }} />
      <Field
        label="Team name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Royal Strikers"
      />
      {record !== null && record.played > 0 && (
        <Card title="Record">
          <View style={styles.grid}>
            <Stat label="Played" value={record.played} />
            <Stat label="Won" value={record.won} />
            <Stat label="Lost" value={record.lost} />
            {record.tied > 0 && <Stat label="Tied" value={record.tied} />}
            {record.noResult > 0 && <Stat label="No result" value={record.noResult} />}
          </View>
        </Card>
      )}
      <Card
        title={`Squad · ${squad.length}`}
        right={<Button label="Add players" icon="person-add" onPress={() => setPicking(true)} />}
      >
        {squad.length === 0 && (
          <Empty
            icon="people-outline"
            title="No players yet"
            hint="Add by name or mobile number."
          />
        )}
        {squad.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.sub}>
                {ROLE[p.role].label}
                {p.mobile === null ? '' : `  ·  ${maskMobile(p.mobile)}`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.name}`}
              onPress={() => toggle(p)}
              hitSlop={10}
            >
              <Ionicons name="remove-circle-outline" size={24} color={C.wicket} />
            </Pressable>
          </View>
        ))}
      </Card>
      <Button label="Save team" icon="checkmark" variant="primary" size="lg" onPress={save} />
      <PlayerPicker
        visible={picking}
        title="Add players"
        selected={squad.map((p) => p.id)}
        onToggle={toggle}
        onClose={() => setPicking(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 16, paddingBottom: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  name: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13 },
});
