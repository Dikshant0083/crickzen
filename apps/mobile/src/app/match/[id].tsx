import {
  currentInnings,
  type InningsState,
  legalInputs,
  type MatchState,
  type Payload,
  squadOf,
  voidLastDelivery,
} from '@criczen/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { API_URL, useAuth } from '../../auth';
import { Manhattan, Worm } from '../../charts';
import { createMatch, saveMatchMeta, useMatch } from '../../db';
import {
  commentary,
  draftFrom,
  liveSnapshot,
  type MatchMeta,
  milestone,
  oversText,
  shareText,
  superOverPayloads,
} from '../../match';
import { InningsCard } from '../../scorecard';
import {
  type Append,
  BallSheet,
  BowlerPicker,
  editContext,
  type Name,
  OpenInnings,
  Pad,
} from '../../scoring';
import { careerStats } from '../../stats';
import { C, radius } from '../../theme';
import { playerOfMatch } from '../../tournament';
import { BallDot, Button, Card, Celebration, Empty, Segmented, TeamBadge, text } from '../../ui';

type Tab = 'live' | 'card' | 'balls' | 'charts';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { match, error, append: save } = useMatch(db, id);
  const [tab, setTab] = useState<Tab>('live');
  const [cheer, setCheer] = useState({ id: 0, label: '', color: '' });
  const auth = useAuth();
  const [sharedCode, setSharedCode] = useState<string | null>(null);
  const liveCode = sharedCode ?? match?.meta.liveCode ?? null;
  const signedIn = auth.user !== null && auth.user !== undefined;
  const { shareLive: sendLive } = auth;

  // Celebrate once the new score exists: a milestone beats FOUR/SIX/WICKET. Undo, edits
  // and opening the match never celebrate, because the log must have grown by a ball.
  const seenEvents = useRef<number | null>(null);
  useEffect(() => {
    if (match === null) return;
    const before = seenEvents.current;
    seenEvents.current = match.events.length;
    if (before === null || match.events.length <= before) return;
    if (match.events.at(-1)?.payload.kind !== 'delivery.recorded') return;
    const inn = match.state.innings.at(-1);
    const ball = inn?.balls.at(-1);
    if (inn === undefined || ball === undefined) return;
    const h = milestone(inn, (p) => match.meta.names[p] ?? p);
    const big =
      h !== null
        ? {
            label: h.text,
            color: h.kind === 'bat' ? C.extra : h.kind === 'bowl' ? C.wicket : C.accent,
          }
        : ball.wicket !== null
          ? { label: 'WICKET!', color: C.wicket }
          : ball.runsOffBat === 6
            ? { label: 'SIX!', color: C.six }
            : ball.runsOffBat === 4
              ? { label: 'FOUR!', color: C.four }
              : null;
    if (big !== null) setCheer((c) => ({ id: c.id + 1, ...big }));
  }, [match]);

  // Once shared, every change (a ball, an undo, an edit) sends the whole score. A failed
  // send is fine: the next one carries everything, so spectators catch up.
  useEffect(() => {
    if (match === null || liveCode === null || !signedIn) return;
    sendLive(
      id,
      liveSnapshot(match.state, (p) => match.meta.names[p] ?? p),
    ).catch(() => {});
  }, [id, match, liveCode, signedIn, sendLive]);

  if (error !== null) return <Text style={[styles.pad, { color: C.wicket }]}>{error}</Text>;
  if (match === null) return <ActivityIndicator style={styles.pad} color={C.accent} />;

  const { state, meta, events } = match;
  const name: Name = (pid) => meta.names[pid] ?? pid;

  /** Saves, or tells the scorer why the engine refused. */
  const append: Append = async (payload) => {
    const refused = await save(payload);
    if (refused !== null) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Not allowed', refused);
      return false;
    }
    const d = payload.kind === 'delivery.recorded' ? payload.delivery : null;
    const big =
      d === null
        ? null
        : d.wicket !== undefined
          ? { label: 'WICKET!', color: C.wicket }
          : d.runsOffBat === 6
            ? { label: 'SIX!', color: C.six }
            : d.runsOffBat === 4
              ? { label: 'FOUR!', color: C.four }
              : null;
    Haptics.impactAsync(
      big === null ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy,
    );
    return true;
  };

  /** Spectators get the score page; a streamer gets the overlay to lay over YouTube video. */
  const shareLink = async (kind: 'page' | 'overlay') => {
    try {
      const { code } = await sendLive(id, liveSnapshot(state, name));
      if (meta.liveCode !== code) await saveMatchMeta(db, id, { ...meta, liveCode: code });
      setSharedCode(code);
      const teams = state.config.teams.join(' vs ');
      await Share.share({
        message:
          kind === 'page'
            ? `🏏 ${teams} — follow live: ${API_URL}/l/${code}`
            : `${API_URL}/l/${code}/overlay`,
      });
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : String(e));
    }
  };

  const chooseShare = () => {
    if (!auth.configured || !signedIn) {
      return Alert.alert(
        'Sign in to share live',
        'Spectators follow your score from a link. Sign in on the Me tab first.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/auth/login') },
        ],
      );
    }
    Alert.alert('Share live', 'Who is the link for?', [
      { text: 'Spectators', onPress: () => shareLink('page') },
      { text: 'YouTube overlay', onPress: () => shareLink('overlay') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const undo = () => {
    const last = voidLastDelivery(state);
    if (last === null) return Alert.alert('Nothing to undo', 'No ball bowled in this innings yet.');
    if (events.at(-1)?.payload.kind === 'bowler.changed') {
      return Alert.alert(
        'Next over already started',
        'A bowler is already chosen for the next over. Open the Balls tab and tap the ball to edit or delete it.',
      );
    }
    append({ kind: 'delivery.voided', targetEventId: last.targetEventId, reason: 'undo' });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: state.config.teams.join(' vs '),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={liveCode === null ? 'Share live link' : 'Share live link again'}
              onPress={chooseShare}
              hitSlop={10}
              style={styles.liveButton}
            >
              <Ionicons name="radio" size={20} color={C.onHero} />
              {liveCode !== null && <View style={styles.liveDot} />}
            </Pressable>
          ),
        }}
      />
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: 'live', label: 'Live' },
            { value: 'card', label: 'Scorecard' },
            { value: 'balls', label: 'Balls' },
            { value: 'charts', label: 'Charts' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {tab === 'live' && (
          <Live matchId={id} state={state} meta={meta} name={name} append={append} onUndo={undo} />
        )}
        {tab === 'card' && <Scorecard state={state} name={name} />}
        {tab === 'balls' && <Balls state={state} name={name} append={append} />}
        {tab === 'charts' &&
          (state.innings.length === 0 ? (
            <Empty icon="stats-chart-outline" title="Charts appear once play starts" />
          ) : (
            <>
              <Worm innings={state.innings} totalOvers={state.config.totalOvers} />
              {state.innings.map((inn) => (
                <Manhattan key={inn.inningsNo} innings={inn} />
              ))}
            </>
          ))}
      </ScrollView>
      <Celebration {...cheer} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Live
// ---------------------------------------------------------------------------

function Live(props: {
  matchId: string;
  state: MatchState;
  meta: MatchMeta;
  name: Name;
  append: Append;
  onUndo: () => void;
}) {
  const { state, name, append } = props;
  const db = useSQLiteContext();
  const innings = currentInnings(state);
  const inputs = legalInputs(state);

  const playSuperOver = async () => {
    const id = randomUUID();
    const error = await createMatch(
      db,
      id,
      { names: props.meta.names, superOverOf: props.matchId },
      superOverPayloads(state, id),
    );
    if (error !== null) return Alert.alert('Could not start the super over', error);
    router.replace({ pathname: '/match/[id]', params: { id } });
  };

  return (
    <>
      {innings !== null && <Hero state={state} innings={innings} />}

      {state.result !== null || state.status === 'abandoned' ? (
        <Card title="Result">
          <Text style={styles.result}>{state.result?.description ?? 'Abandoned'}</Text>
          {state.result?.kind === 'tie' && props.meta.superOverOf === undefined && (
            <Button
              label="Play super over"
              icon="flash"
              variant="primary"
              size="lg"
              onPress={playSuperOver}
            />
          )}
          {state.result !== null && <PlayerOfMatch state={state} name={name} />}
        </Card>
      ) : state.status === 'toss_done' || state.status === 'innings_break' ? (
        <OpenInnings state={state} name={name} append={append} />
      ) : innings !== null ? (
        <>
          <Batters innings={innings} name={name} />
          {inputs.needsBowler ? (
            <>
              <BowlerPicker state={state} innings={innings} name={name} append={append} />
              <Button label="Undo last ball" icon="arrow-undo" onPress={props.onUndo} />
            </>
          ) : (
            <Pad
              state={state}
              innings={innings}
              name={name}
              append={append}
              onUndo={props.onUndo}
            />
          )}
        </>
      ) : null}
    </>
  );
}

function PlayerOfMatch(props: { state: MatchState; name: Name }) {
  const id = playerOfMatch(props.state);
  if (id === null) return null;
  const c = careerStats([props.state], id);
  const line = [
    c.batting.innings > 0 ? `${c.batting.runs} (${c.batting.balls})` : null,
    c.bowling.wickets > 0 ? `${c.bowling.wickets}/${c.bowling.runs}` : null,
  ]
    .filter((x) => x !== null)
    .join('  ·  ');
  return (
    <View style={styles.potm}>
      <Text style={text.label}>Player of the match</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the player's profile and stats"
        onPress={() => router.push({ pathname: '/player/[id]', params: { id } })}
        style={({ pressed }) => [styles.potmRow, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.flex}>
          <Text style={styles.potmName}>⭐ {props.name(id)}</Text>
          {line !== '' && <Text style={text.muted}>{line}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.faint} />
      </Pressable>
    </View>
  );
}

function Hero(props: { state: MatchState; innings: InningsState }) {
  const { innings } = props;
  const inputs = legalInputs(props.state);
  const target = innings.revisedTarget?.runs ?? innings.target;
  const lastOver = innings.balls.at(-1)?.overNo;
  const thisOver = innings.balls.filter((b) => b.overNo === lastOver);

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroTeam}>
          <TeamBadge name={innings.battingTeamId} size={30} />
          <Text style={styles.team}>{innings.battingTeamId}</Text>
        </View>
        {inputs.freeHit && <Text style={styles.freeHit}>FREE HIT</Text>}
      </View>
      <Text style={styles.score} accessibilityRole="header">
        {innings.runs}/{innings.wickets}
        <Text style={styles.overs}>
          {'  '}
          {oversText(innings.legalBalls)}/{innings.totalOvers}
        </Text>
      </Text>
      <View style={styles.rates}>
        <Text style={styles.heroMuted}>CRR {inputs.currentRunRate.toFixed(2)}</Text>
        {target !== null && !innings.closed && (
          <>
            <Text style={styles.need}>
              Need {inputs.runsRequired} off {inputs.ballsRemaining}
            </Text>
            {inputs.requiredRunRate !== null && (
              <Text style={styles.heroMuted}>RRR {inputs.requiredRunRate.toFixed(2)}</Text>
            )}
          </>
        )}
      </View>
      {thisOver.length > 0 && (
        <View style={styles.overRow} accessibilityLabel="This over">
          {thisOver.map((b) => (
            <BallDot key={b.eventId} ball={b} />
          ))}
        </View>
      )}
    </View>
  );
}

function Batters(props: { innings: InningsState; name: Name }) {
  const { innings, name } = props;
  const partnership = innings.partnerships.find((p) => p.unbroken);
  const bowler = innings.bowlers[innings.bowlerId ?? innings.lastOverBowlerId ?? ''];
  return (
    <Card>
      {[innings.strikerId, innings.nonStrikerId]
        .filter((p) => p !== null)
        .map((pid) => {
          const b = innings.batters[pid];
          const striker = pid === innings.strikerId;
          return (
            <View key={pid} style={styles.batRow}>
              <Text style={[styles.batName, !striker && { color: C.muted }]} numberOfLines={1}>
                {name(pid)}
                {striker ? ' 🏏' : ''}
              </Text>
              <Text style={styles.batRuns}>
                {b?.runs ?? 0}
                <Text style={text.muted}> ({b?.balls ?? 0})</Text>
              </Text>
              <Text style={styles.batSmall}>
                {b?.fours ?? 0}×4 {b?.sixes ?? 0}×6
              </Text>
            </View>
          );
        })}
      {partnership !== undefined && (
        <Text style={text.muted}>
          Partnership {partnership.runs} ({partnership.balls})
        </Text>
      )}
      {bowler !== undefined && (
        <View style={[styles.batRow, styles.bowlerRow]}>
          <Text style={styles.batName} numberOfLines={1}>
            {name(bowler.playerId)}
          </Text>
          <Text style={styles.batRuns}>
            {bowler.wickets}-{bowler.runs}
            <Text style={text.muted}> ({oversText(bowler.balls)})</Text>
          </Text>
          <Text style={styles.batSmall}>
            Econ {bowler.balls === 0 ? '-' : ((bowler.runs * 6) / bowler.balls).toFixed(1)}
          </Text>
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Scorecard with sharing
// ---------------------------------------------------------------------------

function Scorecard(props: { state: MatchState; name: Name }) {
  const { state, name } = props;
  const shot = useRef<ComponentRef<typeof View>>(null);

  const shareImage = async () => {
    try {
      const uri = await captureRef(shot, { format: 'png', quality: 1 });
      if (!(await Sharing.isAvailableAsync())) {
        return Alert.alert('Sharing is not available on this device');
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share scorecard' });
    } catch (e) {
      Alert.alert('Could not share', String(e));
    }
  };

  return (
    <>
      <View style={styles.shareRow}>
        <Button
          label="Share text"
          icon="logo-whatsapp"
          style={styles.flex}
          onPress={() => Share.share({ message: shareText(state, name) })}
        />
        <Button label="Share image" icon="image" style={styles.flex} onPress={shareImage} />
      </View>
      <View ref={shot} collapsable={false} style={styles.shot}>
        <Text style={text.h2}>{state.config.teams.join(' vs ')}</Text>
        {state.result !== null && <Text style={styles.result}>{state.result.description}</Text>}
        {state.innings.length === 0 && (
          <Empty icon="document-text-outline" title="No innings yet" />
        )}
        {state.innings.map((inn) => (
          <InningsCard key={inn.inningsNo} innings={inn} name={name} />
        ))}
        <Text style={[text.muted, { textAlign: 'center' }]}>CrickScorer</Text>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ball-by-ball, with edit and delete
// ---------------------------------------------------------------------------

function Balls(props: { state: MatchState; name: Name; append: Append }) {
  const { state, name, append } = props;
  const [inningsNo, setInningsNo] = useState(String(Math.max(1, state.innings.length)));
  const [editing, setEditing] = useState<string | null>(null);
  const innings = state.innings[Number(inningsNo) - 1];

  if (innings === undefined || innings.balls.length === 0) {
    return <Empty icon="list-outline" title="No balls bowled yet" />;
  }

  const ball = innings.balls.find((b) => b.eventId === editing);
  const overs = new Map<number, typeof innings.balls>();
  for (const b of innings.balls) overs.set(b.overNo, [...(overs.get(b.overNo) ?? []), b]);
  const battingXI = squadOf(state, innings.battingTeamId)?.playingXI ?? [];

  const replace = async (payload: Payload) => {
    const ok = await append(payload);
    if (ok) setEditing(null);
    return ok;
  };

  return (
    <>
      {state.innings.length > 1 && (
        <Segmented
          options={state.innings.map((i) => ({
            value: String(i.inningsNo),
            label: i.battingTeamId,
          }))}
          value={inningsNo}
          onChange={setInningsNo}
        />
      )}
      <Text style={text.muted}>
        Tap a ball to correct or delete it. Everything after it is recalculated.
      </Text>
      {[...overs.entries()].reverse().map(([overNo, balls]) => (
        <Card
          key={overNo}
          title={`Over ${overNo + 1} · ${name(balls[0]?.bowlerId ?? '')}`}
          right={
            <Text style={styles.overRuns}>{balls.reduce((s, b) => s + b.teamRuns, 0)} runs</Text>
          }
        >
          {[...balls].reverse().map((b) => (
            <Pressable
              key={b.eventId}
              accessibilityRole="button"
              accessibilityHint="Edit this ball"
              onPress={() => setEditing(b.eventId)}
              style={({ pressed }) => [styles.ballRow, pressed && { opacity: 0.7 }]}
            >
              <BallDot ball={b} />
              <View style={styles.flex}>
                <Text style={text.muted}>
                  {b.overNo}.{b.ballInOver}
                </Text>
                <Text style={text.body}>{commentary(b, name)}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ))}
      {ball !== undefined && (
        <BallSheet
          visible
          title={`Edit ball ${ball.overNo}.${ball.ballInOver}`}
          ctx={editContext(state, innings, ball.strikerId, ball.nonStrikerId)}
          battingXI={battingXI}
          initial={draftFrom(ball)}
          startWithWicket={false}
          name={name}
          onClose={() => setEditing(null)}
          onSubmit={(delivery) =>
            replace({ kind: 'delivery.corrected', targetEventId: ball.eventId, delivery })
          }
          onDelete={() =>
            Alert.alert('Delete ball?', 'The score is recalculated without it.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => replace({ kind: 'delivery.voided', targetEventId: ball.eventId }),
              },
            ])
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 24 },
  liveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  /** Shown once the match is shared: every ball is going out live. */
  liveDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF5A68',
  },
  screen: { flex: 1 },
  tabs: { paddingHorizontal: 16, paddingBottom: 8 },
  body: { padding: 16, paddingTop: 8, gap: 14, paddingBottom: 48 },
  flex: { flex: 1 },
  hero: { backgroundColor: C.hero, borderRadius: radius.lg, padding: 18, gap: 6 },
  heroMuted: { color: C.heroMuted, fontSize: 14 },
  heroTeam: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  team: {
    color: C.heroMuted,
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  freeHit: {
    color: C.onAccent,
    backgroundColor: C.extra,
    fontWeight: '900',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  score: { color: C.onHero, fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overs: { color: C.heroMuted, fontSize: 20, fontWeight: '600' },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' },
  need: { color: C.onHero, fontWeight: '800', fontSize: 15 },
  overRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  batRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bowlerRow: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  batName: { flex: 1, color: C.text, fontSize: 17, fontWeight: '700' },
  batRuns: { color: C.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  batSmall: { color: C.faint, fontSize: 12, width: 64, textAlign: 'right' },
  result: { color: C.accent, fontSize: 20, fontWeight: '800' },
  shareRow: { flexDirection: 'row', gap: 8 },
  shot: { gap: 14, backgroundColor: C.bg, paddingVertical: 4 },
  overRuns: { color: C.text, fontWeight: '800' },
  potmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  potm: { gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
  potmName: { color: C.extra, fontSize: 18, fontWeight: '800' },
  ballRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
});
