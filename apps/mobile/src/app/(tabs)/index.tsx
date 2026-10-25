import { router } from 'expo-router';
import { type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteMatch, loadAllMatches, type StoredMatch, useFocusLoad } from '../../db';
import { hasDemoData, loadDemoData, removeDemoData } from '../../demo';
import { oversText } from '../../match';
import { C, radius } from '../../theme';
import { Button, Empty, text } from '../../ui';

const loadScreen = async (db: SQLiteDatabase) => ({
  list: await loadAllMatches(db),
  demo: await hasDemoData(db),
});

export default function Matches() {
  const db = useSQLiteContext();
  const [data, reload] = useFocusLoad(loadScreen);
  const matches = data?.list ?? null;
  const [busy, setBusy] = useState(false);

  const toggleDemo = async () => {
    if (data?.demo === true) {
      return Alert.alert(
        'Remove demo data?',
        'Deletes only the demo teams, players, matches and tournament.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeDemoData(db).then(reload) },
        ],
      );
    }
    setBusy(true);
    try {
      const problem = await loadDemoData(db);
      if (problem !== null) Alert.alert('Demo data not loaded', problem);
    } catch (e) {
      Alert.alert('Demo data not loaded', String(e));
    } finally {
      setBusy(false);
      reload();
    }
  };

  const confirmDelete = (m: StoredMatch) =>
    Alert.alert(
      'Delete match?',
      `${m.state.config.teams.join(' vs ')} and its stats will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMatch(db, m.id).then(reload) },
      ],
    );

  return (
    <View style={styles.screen}>
      <Button
        label="Start a match"
        icon="add-circle"
        variant="primary"
        size="lg"
        onPress={() => router.push('/new')}
      />
      <FlatList
        data={matches ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          matches === null ? undefined : (
            <Empty icon="baseball-outline" title="No matches yet" hint="Start one above." />
          )
        }
        ListFooterComponent={
          data === null ? undefined : (
            <Button
              label={
                busy ? 'Loading demo data…' : data.demo ? 'Remove demo data' : 'Load demo data'
              }
              icon={data.demo ? 'trash-outline' : 'flask-outline'}
              variant="ghost"
              disabled={busy}
              onPress={toggleDemo}
            />
          )
        }
        renderItem={({ item }) => (
          <MatchCard
            match={item}
            onPress={() => router.push({ pathname: '/match/[id]', params: { id: item.id } })}
            onLongPress={() => confirmDelete(item)}
          />
        )}
      />
    </View>
  );
}

function MatchCard(props: { match: StoredMatch; onPress: () => void; onLongPress: () => void }) {
  const { state, meta, createdAt } = props.match;
  const live = state.result === null && state.status !== 'abandoned';
  const [a, b] = state.config.teams;
  const score = (team: string) => {
    const inn = state.innings.find((i) => i.battingTeamId === team);
    return inn === undefined ? '' : `${inn.runs}/${inn.wickets}  (${oversText(inn.legalBalls)})`;
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the match. Long press to delete."
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.head}>
        <Text style={text.muted}>
          {meta.superOverOf !== undefined ? 'Super over · ' : ''}
          {state.config.totalOvers} ov · {new Date(createdAt).toLocaleDateString()}
        </Text>
        {live && (
          <View style={styles.live}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      {[a, b].map((team) => (
        <View key={team} style={styles.teamRow}>
          <Text style={styles.team} numberOfLines={1}>
            {team}
          </Text>
          <Text style={styles.score}>{score(team)}</Text>
        </View>
      ))}
      <Text style={[styles.result, live && { color: C.muted }]}>
        {state.result?.description ?? (state.status === 'abandoned' ? 'Abandoned' : 'In progress')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 16 },
  list: { gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 8,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.wicket },
  liveText: { color: C.wicket, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  team: { color: C.text, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  score: { color: C.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  result: { color: C.accent, fontWeight: '700', marginTop: 4 },
});
