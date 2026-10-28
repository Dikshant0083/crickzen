import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  listFixtures,
  listPlayers,
  listTournaments,
  loadAllMatches,
  type StoredMatch,
  useFocusLoad,
} from '../../db';
import { oversText } from '../../match';
import { initials, rankPlayers } from '../../people';
import { C, radius } from '../../theme';
import { type IconName, TeamBadge, text } from '../../ui';

const load = async (db: SQLiteDatabase) => {
  const [matches, players, tournaments] = await Promise.all([
    loadAllMatches(db),
    listPlayers(db),
    listTournaments(db),
  ]);
  const cups = await Promise.all(
    tournaments.slice(0, 3).map(async (t) => {
      const fixtures = (await listFixtures(db, t.id)).filter((f) => f.away !== null);
      const done = fixtures.filter((f) => {
        const m = matches.find((x) => x.id === f.matchId);
        return m !== undefined && (m.state.result !== null || m.state.status === 'abandoned');
      }).length;
      return { t, done, total: fixtures.length };
    }),
  );
  return { matches, players, cups };
};

const isLive = (m: StoredMatch) => m.state.result === null && m.state.status !== 'abandoned';

export default function Home() {
  const [data] = useFocusLoad(load);
  if (data === null) return null;

  const live = data.matches.filter(isLive);
  const featured = live[0];
  const recent = data.matches.filter((m) => !isLive(m)).slice(0, 3);
  const states = data.matches.map((m) => m.state);
  const top = rankPlayers(data.players, states).filter((p) => p.career.matches > 0);
  const topBat = rankPlayers(data.players, states, 'batting')[0];
  const topBowl = rankPlayers(data.players, states, 'bowling')[0];
  const fresh = data.matches.length === 0 && data.players.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        {featured === undefined ? (
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Game day?</Text>
            <Text style={styles.heroMuted}>Score every ball, and the stats build themselves.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/new')}
              style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
            >
              <Ionicons name="play" size={18} color={C.hero} />
              <Text style={styles.heroButtonText}>Start a match</Text>
            </Pressable>
          </View>
        ) : (
          <Featured match={featured} />
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.actions}>
          <Action icon="trophy" label="Tournament" onPress={() => router.push('/tournament/new')} />
          <Action icon="shield" label="Teams" onPress={() => router.push('/teams')} />
          <Action icon="people" label="Players" onPress={() => router.push('/players')} />
          <Action icon="podium" label="Leaders" onPress={() => router.push('/players')} />
        </View>

        {fresh && (
          <View style={styles.welcome}>
            <Ionicons name="baseball" size={40} color={C.accent} />
            <Text style={text.h2}>Welcome to CrickScorer</Text>
            <Text style={text.muted}>
              Save your teams once, then score every ball. Scorecards, player stats and points
              tables build themselves.
            </Text>
          </View>
        )}

        {live.length > 1 && (
          <Section title="Also live">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hscroll}
            >
              {live.slice(1).map((m) => (
                <LiveCard key={m.id} match={m} />
              ))}
            </ScrollView>
          </Section>
        )}

        {data.cups.length > 0 && (
          <Section title="Tournaments" more={() => router.push('/tournaments')}>
            {data.cups.map(({ t, done, total }) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Ionicons name="trophy" size={26} color={C.extra} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{t.name}</Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progress,
                        { width: `${total === 0 ? 0 : (done / total) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={text.muted}>
                    {done}/{total} matches played · {t.teams.length} teams
                  </Text>
                </View>
              </Pressable>
            ))}
          </Section>
        )}

        {(topBat?.career.batting.runs ?? 0) > 0 && (
          <Section title="Top performers" more={() => router.push('/players')}>
            <View style={styles.leaders}>
              {topBat !== undefined && (
                <Leader
                  label="Most runs"
                  name={topBat.name}
                  value={`${topBat.career.batting.runs}`}
                  id={topBat.id}
                />
              )}
              {topBowl !== undefined && topBowl.career.bowling.wickets > 0 && (
                <Leader
                  label="Most wickets"
                  name={topBowl.name}
                  value={`${topBowl.career.bowling.wickets}`}
                  id={topBowl.id}
                />
              )}
            </View>
            {top.slice(0, 3).map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: p.id } })}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>{initials(p.name)}</Text>
                </View>
                <Text style={[styles.rowTitle, styles.flex]}>{p.name}</Text>
                <Text style={text.muted}>
                  {p.career.batting.runs} r · {p.career.bowling.wickets} w
                </Text>
              </Pressable>
            ))}
          </Section>
        )}

        {recent.length > 0 && (
          <Section title="Recent results" more={() => router.push('/matches')}>
            {recent.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/match/[id]', params: { id: m.id } })}
                style={({ pressed }) => [styles.result, pressed && styles.pressed]}
              >
                <View style={styles.liveTeams}>
                  {m.state.config.teams.map((t) => (
                    <TeamBadge key={t} name={t} size={22} />
                  ))}
                  <Text style={[styles.rowTitle, styles.flex]} numberOfLines={1}>
                    {m.state.config.teams.join(' vs ')}
                  </Text>
                </View>
                <Text style={styles.resultText}>{m.state.result?.description ?? 'Abandoned'}</Text>
              </Pressable>
            ))}
          </Section>
        )}
      </View>
    </ScrollView>
  );
}

function Action(props: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={props.icon} size={24} color={C.accent} />
      </View>
      <Text style={styles.actionLabel}>{props.label}</Text>
    </Pressable>
  );
}

/** The headline live match: both sides' scores and the chase equation at a glance. */
function Featured(props: { match: StoredMatch }) {
  const { state } = props.match;
  const inn = state.innings.at(-1);
  const target = inn?.revisedTarget?.runs ?? inn?.target ?? null;
  const left = inn === undefined ? 0 : inn.totalOvers * 6 - inn.legalBalls;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the match"
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: props.match.id } })}
      style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
    >
      <View style={styles.liveHead}>
        <View style={styles.dot} />
        <Text style={styles.heroLive}>LIVE</Text>
        <Text style={styles.heroMuted}>
          · {state.config.totalOvers} overs
          {inn !== undefined ? ` · innings ${inn.inningsNo}` : ''}
        </Text>
      </View>
      {state.config.teams.map((t) => {
        const i = state.innings.filter((x) => x.battingTeamId === t).at(-1);
        const batting = i !== undefined && i === inn;
        return (
          <View key={t} style={styles.heroTeamRow}>
            <TeamBadge name={t} size={28} />
            <Text style={[styles.heroTeam, !batting && styles.heroDim]} numberOfLines={1}>
              {t}
            </Text>
            {i !== undefined && (
              <Text style={[styles.heroScore, !batting && styles.heroDim]}>
                {i.runs}/{i.wickets}
                <Text style={styles.heroOvers}> ({oversText(i.legalBalls)})</Text>
              </Text>
            )}
          </View>
        );
      })}
      <Text style={styles.heroMuted}>
        {inn === undefined
          ? 'Toss done · not started'
          : target !== null && !inn.closed
            ? `${inn.battingTeamId} need ${Math.max(0, target - inn.runs)} off ${left}`
            : `${inn.battingTeamId} batting`}
      </Text>
    </Pressable>
  );
}

function Section(props: { title: string; more?: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={text.label}>{props.title}</Text>
        {props.more !== undefined && (
          <Pressable accessibilityRole="button" onPress={props.more} hitSlop={8}>
            <Text style={styles.more}>See all</Text>
          </Pressable>
        )}
      </View>
      {props.children}
    </View>
  );
}

function LiveCard(props: { match: StoredMatch }) {
  const { state } = props.match;
  const inn = state.innings.at(-1);
  const target = inn?.target ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: props.match.id } })}
      style={({ pressed }) => [styles.live, pressed && styles.pressed]}
    >
      <View style={styles.liveHead}>
        <View style={styles.dot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <View style={styles.liveTeams}>
        {state.config.teams.map((t) => (
          <TeamBadge key={t} name={t} size={26} />
        ))}
        <Text style={[styles.rowTitle, styles.flex]} numberOfLines={1}>
          {state.config.teams.join(' vs ')}
        </Text>
      </View>
      {inn === undefined ? (
        <Text style={text.muted}>Toss done · not started</Text>
      ) : (
        <>
          <Text style={styles.liveScore}>
            {inn.runs}/{inn.wickets}
            <Text style={text.muted}> ({oversText(inn.legalBalls)})</Text>
          </Text>
          <Text style={text.muted} numberOfLines={1}>
            {inn.battingTeamId}
            {target !== null && !inn.closed
              ? ` need ${Math.max(0, target - inn.runs)}`
              : ' batting'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function Leader(props: { label: string; name: string; value: string; id: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/player/[id]', params: { id: props.id } })}
      style={({ pressed }) => [styles.leader, pressed && styles.pressed]}
    >
      <Text style={text.muted}>{props.label}</Text>
      <Text style={styles.leaderValue}>{props.value}</Text>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {props.name}
      </Text>
    </Pressable>
  );
}

const card = {
  backgroundColor: C.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: C.border,
} as const;

const styles = StyleSheet.create({
  screen: { paddingBottom: 48 },
  body: { padding: 16, gap: 22 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  hero: { backgroundColor: C.hero, paddingHorizontal: 16, paddingBottom: 20 },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  heroTitle: { color: C.onHero, fontSize: 26, fontWeight: '900' },
  heroMuted: { color: C.heroMuted, fontSize: 14 },
  heroLive: { color: '#FF8A94', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  heroTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTeam: { flex: 1, color: C.onHero, fontSize: 17, fontWeight: '800' },
  heroScore: { color: C.onHero, fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  heroOvers: { color: C.heroMuted, fontSize: 14, fontWeight: '600' },
  heroDim: { opacity: 0.7 },
  heroButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.onHero,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  heroButtonText: { color: C.hero, fontWeight: '900', fontSize: 16 },
  liveTeams: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: {
    ...card,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 14,
  },
  actionLabel: { color: C.muted, fontWeight: '700', fontSize: 12 },
  welcome: { ...card, padding: 20, gap: 8, alignItems: 'flex-start' },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  more: { color: C.accent, fontWeight: '700' },
  hscroll: { gap: 10 },
  live: { ...card, width: 220, padding: 14, gap: 4 },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.wicket },
  liveText: { color: C.wicket, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  liveScore: { color: C.text, fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  row: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  progressTrack: {
    height: 6,
    backgroundColor: C.raised,
    borderRadius: 3,
    marginVertical: 6,
    overflow: 'hidden',
  },
  progress: { height: 6, backgroundColor: C.accent },
  leaders: { flexDirection: 'row', gap: 10 },
  leader: { ...card, flex: 1, padding: 14, gap: 2 },
  leaderValue: { color: C.accent, fontSize: 30, fontWeight: '900' },
  rank: { color: C.faint, fontWeight: '900', width: 16 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: C.accent, fontWeight: '800' },
  result: { ...card, padding: 14, gap: 4 },
  resultText: { color: C.accent, fontWeight: '700' },
});
