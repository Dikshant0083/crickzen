import { otherTeam } from '@criczen/engine';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getPlayer, loadAllMatches, useFocusLoad } from '../../db';
import { oversText } from '../../match';
import { initials, ROLE } from '../../people';
import { average, careerStats, rate } from '../../stats';
import { C } from '../../theme';
import { Button, Card, Empty, Stat, text } from '../../ui';

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    async (db: SQLiteDatabase) => ({
      player: await getPlayer(db, id),
      matches: await loadAllMatches(db),
    }),
    [id],
  );
  const [data] = useFocusLoad(load);

  if (data === null) return <ActivityIndicator style={{ padding: 24 }} color={C.accent} />;
  const { player, matches } = data;
  if (player === null) return <Empty icon="person-outline" title="Player not found" />;

  const states = matches.map((m) => m.state);
  const c = careerStats(states, id);
  const bat = c.batting;
  const bowl = c.bowling;
  const outs = bat.innings - bat.notOuts;
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
          <Text style={text.muted}>
            {ROLE[player.role].label}
            {player.mobile === null ? '' : `  ·  ${player.mobile}`}
          </Text>
        </View>
      </View>
      <Button
        label="Edit player"
        icon="create"
        variant="ghost"
        onPress={() => router.push({ pathname: '/player/edit', params: { id } })}
      />

      <Card title={`Batting · ${c.matches} matches`}>
        <View style={styles.grid}>
          <Stat label="Runs" value={bat.runs} />
          <Stat label="Innings" value={bat.innings} />
          <Stat
            label="Highest"
            value={bat.innings === 0 ? '-' : `${bat.highest}${bat.highestNotOut ? '*' : ''}`}
          />
          <Stat label="Average" value={average(bat.runs, outs)} />
          <Stat label="Strike rate" value={rate(bat.runs, bat.balls, 100)} />
          <Stat label="Not outs" value={bat.notOuts} />
          <Stat label="50s / 100s" value={`${bat.fifties} / ${bat.hundreds}`} />
          <Stat label="4s / 6s" value={`${bat.fours} / ${bat.sixes}`} />
          <Stat label="Ducks" value={bat.ducks} />
        </View>
      </Card>

      <Card title="Bowling">
        <View style={styles.grid}>
          <Stat label="Wickets" value={bowl.wickets} />
          <Stat label="Overs" value={oversText(bowl.balls)} />
          <Stat
            label="Best"
            value={bowl.innings === 0 ? '-' : `${bowl.bestWickets}/${bowl.bestRuns}`}
          />
          <Stat label="Economy" value={rate(bowl.runs, bowl.balls, 6)} />
          <Stat label="Average" value={average(bowl.runs, bowl.wickets)} />
          <Stat label="Maidens" value={bowl.maidens} />
        </View>
      </Card>

      <Card title="Fielding">
        <View style={styles.grid}>
          <Stat label="Catches" value={c.fielding.catches} />
          <Stat label="Stumpings" value={c.fielding.stumpings} />
          <Stat label="Run outs" value={c.fielding.runOuts} />
        </View>
      </Card>

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matchRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, gap: 2 },
  matchTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
});
