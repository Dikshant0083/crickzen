import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
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
import {
  deleteTournament,
  getTournament,
  insertFixtures,
  listFixtures,
  loadAllMatches,
  type StoredMatch,
  useFocusLoad,
} from '../../db';
import { oversText } from '../../match';
import { C, radius } from '../../theme';
import {
  type Fixture,
  fixtureWinner,
  isDone,
  leaders,
  nextStep,
  type Played,
  pointsTable,
  stageLabel,
} from '../../tournament';
import { Button, Card, Empty, Segmented, text } from '../../ui';

type Tab = 'fixtures' | 'table' | 'leaders';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const load = useCallback(
    async (db: SQLiteDatabase) => {
      const [tournament, fixtures, matches] = await Promise.all([
        getTournament(db, id),
        listFixtures(db, id),
        loadAllMatches(db),
      ]);
      return { tournament, fixtures, matches };
    },
    [id],
  );
  const [data, reload] = useFocusLoad(load);
  const [tab, setTab] = useState<Tab>('fixtures');

  if (data === null) return <ActivityIndicator style={{ padding: 24 }} color={C.accent} />;
  const { tournament: t, fixtures, matches } = data;
  if (t === null) return <Empty icon="trophy-outline" title="Tournament not found" />;

  const byId = new Map(matches.map((m) => [m.id, m]));
  const played = new Map<string, Played>();
  for (const f of fixtures) {
    const m = f.matchId === null ? undefined : byId.get(f.matchId);
    if (m === undefined) continue;
    const so = matches.find((x) => x.meta.superOverOf === m.id);
    played.set(
      m.id,
      so === undefined ? { state: m.state } : { state: m.state, superOver: so.state },
    );
  }
  const next = nextStep(t, fixtures, played);
  const tournamentMatches = fixtures.flatMap((f) => {
    const m = f.matchId === null ? undefined : byId.get(f.matchId);
    return m === undefined ? [] : [m];
  });

  const createNext = async () => {
    if (next.kind !== 'create') return;
    const start = fixtures.length;
    await insertFixtures(
      db,
      next.fixtures.map((f, i) => ({
        ...f,
        id: randomUUID(),
        tournamentId: t.id,
        seq: start + i,
        matchId: null,
      })),
    );
    reload();
  };

  const remove = () =>
    Alert.alert('Delete tournament?', 'Its matches stay in your match list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteTournament(db, t.id).then(() => router.back()),
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: t.name }} />
      {next.kind === 'champion' && (
        <View style={styles.champion}>
          <Ionicons name="trophy" size={36} color={C.onAccent} />
          <View>
            <Text style={styles.championLabel}>Champions</Text>
            <Text style={styles.championName}>{next.team}</Text>
          </View>
        </View>
      )}
      <Segmented
        options={[
          { value: 'fixtures', label: 'Fixtures' },
          { value: 'table', label: t.format === 'league' ? 'Table' : 'Bracket' },
          { value: 'leaders', label: 'Leaders' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'fixtures' && (
        <>
          {next.kind === 'create' && (
            <Button
              label={next.label}
              icon="git-merge"
              variant="primary"
              size="lg"
              onPress={createNext}
            />
          )}
          <Rounds fixtures={fixtures} byId={byId} played={played} />
        </>
      )}

      {tab === 'table' &&
        (t.format === 'league' ? (
          <Table rows={pointsTable(t, fixtures, played)} playoffs={t.playoffs} />
        ) : (
          <Rounds fixtures={fixtures} byId={byId} played={played} compact />
        ))}

      {tab === 'leaders' && <Leaders matches={tournamentMatches} />}

      <Button label="Delete tournament" icon="trash" variant="ghost" onPress={remove} />
    </ScrollView>
  );
}

function Rounds(props: {
  fixtures: readonly Fixture[];
  byId: ReadonlyMap<string, StoredMatch>;
  played: ReadonlyMap<string, Played>;
  compact?: boolean;
}) {
  const groups = new Map<string, Fixture[]>();
  for (const f of props.fixtures) {
    const label = stageLabel(f, props.fixtures);
    groups.set(label, [...(groups.get(label) ?? []), f]);
  }
  return (
    <>
      {[...groups.entries()].map(([label, list]) => (
        <Card key={label} title={label}>
          {list.map((f) => (
            <FixtureRow
              key={f.id}
              fixture={f}
              match={f.matchId === null ? undefined : props.byId.get(f.matchId)}
              played={f.matchId === null ? undefined : props.played.get(f.matchId)}
              compact={props.compact === true}
            />
          ))}
        </Card>
      ))}
    </>
  );
}

function FixtureRow(props: {
  fixture: Fixture;
  match: StoredMatch | undefined;
  played: Played | undefined;
  compact: boolean;
}) {
  const { fixture: f, match } = props;
  if (f.away === null) {
    return (
      <View style={styles.fixture}>
        <Text style={styles.teams}>{f.home}</Text>
        <Text style={text.muted}>Bye · goes through</Text>
      </View>
    );
  }

  const done = isDone(f, props.played);
  const winner = done ? fixtureWinner(f, props.played) : null;
  const score = (team: string) => {
    const inn = match?.state.innings.find((i) => i.battingTeamId === team);
    return inn === undefined ? '' : `${inn.runs}/${inn.wickets} (${oversText(inn.legalBalls)})`;
  };
  const open = () => {
    if (match !== undefined) router.push({ pathname: '/match/[id]', params: { id: match.id } });
    else router.push({ pathname: '/new', params: { fixture: f.id } });
  };
  const status =
    match === undefined
      ? 'Tap to start'
      : done
        ? (match.state.result?.description ?? 'Abandoned')
        : match.state.result?.kind === 'tie'
          ? 'Tied: play the super over'
          : 'LIVE';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={match === undefined ? 'Start this match' : 'Open this match'}
      onPress={open}
      style={({ pressed }) => [styles.fixture, pressed && { opacity: 0.7 }]}
    >
      {[f.home, f.away].map((team) => (
        <View key={team} style={styles.teamRow}>
          <Text
            style={[styles.teams, winner !== null && winner !== team && { color: C.muted }]}
            numberOfLines={1}
          >
            {team}
            {winner === team ? ' ✓' : ''}
          </Text>
          {!props.compact && <Text style={styles.score}>{score(team)}</Text>}
        </View>
      ))}
      <Text
        style={[
          text.muted,
          status === 'LIVE' && { color: C.wicket, fontWeight: '800' },
          match === undefined && { color: C.accent },
        ]}
      >
        {status}
      </Text>
    </Pressable>
  );
}

function Table(props: { rows: ReturnType<typeof pointsTable>; playoffs: string }) {
  const qualify = props.playoffs === 'semis' ? 4 : props.playoffs === 'final' ? 2 : 1;
  const cols = ['P', 'W', 'L', 'T', 'NR', 'Pts', 'NRR'];
  return (
    <Card>
      <View style={styles.tr}>
        <Text style={[styles.tName, styles.th]}>Team</Text>
        {cols.map((c) => (
          <Text key={c} style={[styles.td, styles.th, c === 'NRR' && styles.nrr]}>
            {c}
          </Text>
        ))}
      </View>
      {props.rows.map((r, i) => (
        <View key={r.team} style={[styles.tr, i < qualify && r.played > 0 && styles.qualified]}>
          <Text style={[styles.tName, { color: C.text, fontWeight: '700' }]} numberOfLines={1}>
            {i + 1}. {r.team}
          </Text>
          {[r.played, r.won, r.lost, r.tied, r.noResult].map((v, k) => (
            <Text key={cols[k]} style={styles.td}>
              {v}
            </Text>
          ))}
          <Text style={[styles.td, { fontWeight: '900', color: C.accent }]}>{r.points}</Text>
          <Text style={[styles.td, styles.nrr]}>{(r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(3)}</Text>
        </View>
      ))}
      <Text style={text.muted}>
        Win 2 · tie or no result 1. Level on points: wins, then net run rate.
      </Text>
    </Card>
  );
}

function Leaders(props: { matches: readonly StoredMatch[] }) {
  if (props.matches.length === 0)
    return <Empty icon="podium-outline" title="Leaders appear after the first match" />;
  const names: Record<string, string> = Object.assign(
    {},
    ...props.matches.map((m) => m.meta.names),
  );
  const name = (pid: string) => names[pid] ?? pid;
  const top = leaders(props.matches.map((m) => m.state));
  const awards = props.matches.filter((m) => m.meta.playerOfMatch !== undefined);

  const list = (title: string, unit: string, rows: ReturnType<typeof leaders>['runs']) => (
    <Card title={title}>
      {rows.length === 0 && <Text style={text.muted}>Nobody yet.</Text>}
      {rows.map((r, i) => (
        <View key={r.playerId} style={styles.leader}>
          <Text style={styles.rank}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.teams}>{name(r.playerId)}</Text>
            <Text style={text.muted}>{r.detail}</Text>
          </View>
          <Text style={styles.value}>
            {r.value}
            <Text style={text.muted}> {unit}</Text>
          </Text>
        </View>
      ))}
    </Card>
  );

  return (
    <>
      {list('Most runs', 'runs', top.runs)}
      {list('Most wickets', 'wkts', top.wickets)}
      <Card title="Players of the match">
        {awards.length === 0 && (
          <Text style={text.muted}>Pick one from a finished match's Live tab.</Text>
        )}
        {awards.map((m) => (
          <View key={m.id} style={styles.leader}>
            <Ionicons name="star" size={18} color={C.extra} />
            <Text style={[styles.teams, { flex: 1 }]}>{name(m.meta.playerOfMatch ?? '')}</Text>
            <Text style={text.muted}>{m.state.config.teams.join(' v ')}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 48 },
  champion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.accent,
    borderRadius: radius.lg,
    padding: 18,
  },
  championLabel: {
    color: C.onAccent,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  championName: { color: C.onAccent, fontSize: 24, fontWeight: '900' },
  fixture: { gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  teamRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  teams: { color: C.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  score: { color: C.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  qualified: { backgroundColor: C.raised },
  th: { color: C.faint, fontWeight: '800', fontSize: 12 },
  tName: { flex: 1, color: C.text },
  td: { width: 28, textAlign: 'right', color: C.text, fontVariant: ['tabular-nums'] },
  nrr: { width: 58 },
  leader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rank: { color: C.faint, fontWeight: '900', width: 18 },
  value: { color: C.text, fontSize: 20, fontWeight: '900' },
});
