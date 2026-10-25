import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { loadAllMatches, type StoredMatch, useFocusLoad } from '../../db';
import { oversText } from '../../match';
import { C, radius } from '../../theme';
import { Button, Empty, TeamBadge, text } from '../../ui';

export default function Matches() {
  const [matches] = useFocusLoad(loadAllMatches);

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
        renderItem={({ item }) => (
          <MatchCard
            match={item}
            onPress={() => router.push({ pathname: '/match/[id]', params: { id: item.id } })}
          />
        )}
      />
    </View>
  );
}

function MatchCard(props: { match: StoredMatch; onPress: () => void }) {
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
      onPress={props.onPress}
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
          <TeamBadge name={team} size={28} />
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
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  team: { flex: 1, color: C.text, fontSize: 18, fontWeight: '700' },
  score: { color: C.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  result: { color: C.accent, fontWeight: '700', marginTop: 4 },
});
