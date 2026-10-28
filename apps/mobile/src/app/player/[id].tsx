import { otherTeam } from '@criczen/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getPlayer, loadAllMatches, type Player, savePlayer, useFocusLoad } from '../../db';
import { initials, ROLE } from '../../people';
import { CareerCards } from '../../scorecard';
import { normalizeMobile } from '../../stats';
import { C } from '../../theme';
import { Button, Card, Empty, Field, text } from '../../ui';

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    async (db: SQLiteDatabase) => ({
      player: await getPlayer(db, id),
      matches: await loadAllMatches(db),
    }),
    [id],
  );
  const [data, reload] = useFocusLoad(load);

  if (data === null) return <ActivityIndicator style={{ padding: 24 }} color={C.accent} />;
  const { player, matches } = data;
  if (player === null) return <Empty icon="person-outline" title="Player not found" />;

  const states = matches.map((m) => m.state);
  const history = matches.filter((m) =>
    Object.values(m.state.squads).some((s) => s.playingXI.includes(id)),
  );

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: player.name }} />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials(player.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.h1}>{player.name}</Text>
          <Text style={text.muted}>{ROLE[player.role].label}</Text>
        </View>
      </View>

      {player.mobile === null && <AddMobile player={player} onSaved={reload} />}
      <CareerCards states={states} id={id} />

      <Card title="Matches">
        {history.length === 0 && <Text style={text.muted}>Not picked in a match yet.</Text>}
        {history.map((m) => {
          const team =
            Object.values(m.state.squads).find((s) => s.playingXI.includes(id))?.teamId ?? '';
          const line = m.state.innings
            .flatMap((inn) => {
              const b = inn.batters[id];
              const w = inn.bowlers[id];
              return [
                b !== undefined ? `${b.runs}${b.dismissal === null ? '*' : ''} (${b.balls})` : null,
                w !== undefined && w.balls > 0 ? `${w.wickets}/${w.runs}` : null,
              ];
            })
            .filter((s) => s !== null)
            .join('  ·  ');
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/match/[id]', params: { id: m.id } })}
              style={({ pressed }) => [styles.matchRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.matchTitle}>
                {team} vs {otherTeam(m.state.config, team)}
              </Text>
              <Text style={text.muted}>
                {new Date(m.createdAt).toLocaleDateString()}
                {line === '' ? '' : `  ·  ${line}`}
              </Text>
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}

/** Players saved before numbers were required: adding one links their stats to their account. */
function AddMobile(props: { player: Player; onSaved: () => void }) {
  const db = useSQLiteContext();
  const [mobile, setMobile] = useState('');
  const save = async () => {
    const normalized = normalizeMobile(mobile);
    if (normalized === null || normalized.length !== 10) {
      return Alert.alert('Check the number', 'Mobile number should have 10 digits.');
    }
    const problem = await savePlayer(db, { ...props.player, mobile: normalized });
    if (problem !== null) return Alert.alert('Already added', problem);
    props.onSaved();
  };
  return (
    <Card title="Add mobile number">
      <Text style={text.muted}>
        When {props.player.name} signs in with this number, these stats show on their Me tab.
      </Text>
      <Field
        label="Mobile number"
        value={mobile}
        onChangeText={setMobile}
        placeholder="10-digit number"
        keyboardType="phone-pad"
      />
      <Button label="Save number" icon="checkmark" variant="primary" onPress={save} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: C.onAccent, fontSize: 24, fontWeight: '900' },
  matchRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, gap: 2 },
  matchTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
});
