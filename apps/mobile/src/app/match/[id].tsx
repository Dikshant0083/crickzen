import {
  currentInnings,
  type InningsState,
  legalInputs,
  type MatchState,
  type Payload,
  squadOf,
  voidLastDelivery,
} from '@criczen/engine';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { type ComponentRef, useRef, useState } from 'react';
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
import { Manhattan, Worm } from '../../charts';
import { createMatch, useMatch } from '../../db';
import {
  commentary,
  draftFrom,
  type MatchMeta,
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
import { C, radius } from '../../theme';
import { BallDot, Button, Card, Empty, Segmented, text } from '../../ui';

type Tab = 'live' | 'card' | 'balls' | 'charts';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { match, error, append: save } = useMatch(db, id);
  const [tab, setTab] = useState<Tab>('live');

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
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
      <Stack.Screen options={{ title: state.config.teams.join(' vs ') }} />
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

function Hero(props: { state: MatchState; innings: InningsState }) {
  const { innings } = props;
  const inputs = legalInputs(props.state);
  const target = innings.revisedTarget?.runs ?? innings.target;
  const lastOver = innings.balls.at(-1)?.overNo;
  const thisOver = innings.balls.filter((b) => b.overNo === lastOver);

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <Text style={styles.team}>{innings.battingTeamId}</Text>
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
        <Text style={text.muted}>CRR {inputs.currentRunRate.toFixed(2)}</Text>
        {target !== null && !innings.closed && (
          <>
            <Text style={styles.need}>
              Need {inputs.runsRequired} off {inputs.ballsRemaining}
            </Text>
            {inputs.requiredRunRate !== null && (
              <Text style={text.muted}>RRR {inputs.requiredRunRate.toFixed(2)}</Text>
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
  screen: { flex: 1 },
  tabs: { paddingHorizontal: 16, paddingBottom: 8 },
  body: { padding: 16, paddingTop: 8, gap: 14, paddingBottom: 48 },
  flex: { flex: 1 },
  hero: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 6,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  team: {
    color: C.muted,
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
  score: { color: C.text, fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'] },
  overs: { color: C.muted, fontSize: 20, fontWeight: '600' },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' },
  need: { color: C.accent, fontWeight: '800', fontSize: 15 },
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
  ballRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
});
