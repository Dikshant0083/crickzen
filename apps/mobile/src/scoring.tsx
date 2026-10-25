import {
  allOutWicketCount,
  type Delivery,
  type DismissalKind,
  type InningsState,
  legalInputs,
  type MatchState,
  maxOversPerBowler,
  otherTeam,
  type Payload,
  type PlayerId,
  requiresFielder,
  squadOf,
  type WicketInput,
} from '@criczen/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  buildDelivery,
  DISMISSAL_LABEL,
  type Draft,
  draftDelivery,
  type ExtraMode,
  oversText,
  type Runs,
} from './match';
import { C, radius } from './theme';
import { Button, Card, Chip, Choice, Field, Sheet, text } from './ui';

export type Append = (payload: Payload) => Promise<boolean>;
export type Name = (id: PlayerId) => string;

const ALL_DISMISSALS = Object.keys(DISMISSAL_LABEL) as DismissalKind[];
const RUNS: readonly Runs[] = [0, 1, 2, 3, 4, 5, 6];
const EXTRAS: readonly { value: ExtraMode; label: string }[] = [
  { value: 'none', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
  { value: 'noball', label: 'No ball' },
  { value: 'bye', label: 'Bye' },
  { value: 'legbye', label: 'Leg bye' },
];

const runOptions = (max = 6) =>
  RUNS.filter((r) => r <= max).map((r) => ({ value: String(r) as `${Runs}`, label: String(r) }));

// ---------------------------------------------------------------------------
// Innings start and bowler choice
// ---------------------------------------------------------------------------

export function OpenInnings(props: { state: MatchState; name: Name; append: Append }) {
  const { state, name } = props;
  const [striker, setStriker] = useState<PlayerId | null>(null);
  const [nonStriker, setNonStriker] = useState<PlayerId | null>(null);
  const [bowler, setBowler] = useState<PlayerId | null>(null);

  const previous = state.innings.at(-1);
  const toss = state.toss;
  const battingTeamId =
    previous !== undefined
      ? previous.bowlingTeamId
      : toss === null || toss.choice === 'bat'
        ? (toss?.winnerTeamId ?? state.config.teams[0])
        : otherTeam(state.config, toss.winnerTeamId);
  const batting = squadOf(state, battingTeamId)?.playingXI ?? [];
  const bowling = squadOf(state, otherTeam(state.config, battingTeamId))?.playingXI ?? [];
  const opts = (ids: readonly PlayerId[]) => ids.map((p) => ({ value: p, label: name(p) }));
  const ready = striker !== null && nonStriker !== null && bowler !== null;

  return (
    <Card title={previous === undefined ? 'First innings' : 'Second innings'}>
      {previous !== undefined && (
        <Text style={text.h2}>
          {battingTeamId} need {previous.runs + 1} to win
        </Text>
      )}
      <Text style={text.label}>{battingTeamId} · striker</Text>
      <Choice options={opts(batting)} value={striker} onChange={setStriker} />
      <Text style={text.label}>Non-striker</Text>
      <Choice
        options={opts(batting.filter((p) => p !== striker))}
        value={nonStriker}
        onChange={setNonStriker}
      />
      <Text style={text.label}>Opening bowler</Text>
      <Choice options={opts(bowling)} value={bowler} onChange={setBowler} />
      <Button
        label="Start innings"
        icon="play"
        variant="primary"
        size="lg"
        disabled={!ready}
        onPress={() =>
          ready &&
          props.append({
            kind: 'innings.opened',
            inningsNo: previous === undefined ? 1 : 2,
            battingTeamId,
            strikerId: striker,
            nonStrikerId: nonStriker,
            bowlerId: bowler,
          })
        }
      />
    </Card>
  );
}

export function BowlerPicker(props: {
  state: MatchState;
  innings: InningsState;
  name: Name;
  append: Append;
}) {
  const { state, innings, name } = props;
  const inputs = legalInputs(state);
  const limit = maxOversPerBowler(state.config);
  return (
    <Card title={`Over ${inputs.overNo + 1} · choose the bowler`}>
      {inputs.eligibleBowlers.length === 0 && (
        <Text style={text.muted}>
          Every bowler has used their overs. End the innings from More.
        </Text>
      )}
      {inputs.eligibleBowlers.map((pid) => {
        const b = innings.bowlers[pid];
        return (
          <Pressable
            key={pid}
            accessibilityRole="button"
            onPress={() => props.append({ kind: 'bowler.changed', bowlerId: pid })}
            style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.pickName}>{name(pid)}</Text>
            <Text style={text.muted}>
              {b === undefined
                ? `0/${limit} ov`
                : `${oversText(b.balls)}-${b.maidens}-${b.runs}-${b.wickets}  ·  ${b.completedOvers}/${limit} ov`}
            </Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The scoring pad
// ---------------------------------------------------------------------------

export function Pad(props: {
  state: MatchState;
  innings: InningsState;
  name: Name;
  append: Append;
  onUndo: () => void;
}) {
  const { state, innings, name, append } = props;
  const [mode, setMode] = useState<ExtraMode>('none');
  const [sheet, setSheet] = useState<'wicket' | 'custom' | 'more' | null>(null);
  const inputs = legalInputs(state);

  const tap = async (runs: Runs) => {
    if (await append({ kind: 'delivery.recorded', delivery: buildDelivery(mode, runs) }))
      setMode('none');
  };

  const ctx = liveContext(state, innings);
  const record = async (delivery: Delivery) => {
    const ok = await append({ kind: 'delivery.recorded', delivery });
    if (ok) {
      setSheet(null);
      setMode('none');
    }
    return ok;
  };

  return (
    <View style={styles.pad}>
      <View style={styles.extras}>
        {EXTRAS.map((e) => (
          <Chip
            key={e.value}
            label={e.label}
            selected={mode === e.value}
            onPress={() => setMode(e.value)}
          />
        ))}
      </View>
      <Text style={text.muted}>
        {mode === 'none'
          ? 'Tap the runs scored off the bat.'
          : mode === 'noball'
            ? 'No ball: tap runs off the bat (0 if none).'
            : `${EXTRAS.find((e) => e.value === mode)?.label}: tap the runs the batters ran.`}
      </Text>
      <View style={styles.grid}>
        {([0, 1, 2, 3, 4, 6] as const).map((r) => (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityLabel={`${r} run${r === 1 ? '' : 's'}`}
            onPress={() => tap(r)}
            style={({ pressed }) => [
              styles.runKey,
              r === 4 && { borderColor: C.four },
              r === 6 && { borderColor: C.six },
              pressed && { backgroundColor: C.raised },
            ]}
          >
            <Text
              style={[styles.runText, r === 4 && { color: C.four }, r === 6 && { color: C.six }]}
            >
              {r}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button
        label="Wicket"
        icon="close-circle"
        variant="danger"
        size="lg"
        onPress={() => setSheet('wicket')}
      />
      <View style={styles.row}>
        <Button label="Undo" icon="arrow-undo" style={styles.flex} onPress={props.onUndo} />
        <Button
          label="5, overthrows…"
          icon="create"
          style={styles.flex}
          onPress={() => setSheet('custom')}
        />
        <Button
          label="More"
          icon="ellipsis-horizontal"
          style={styles.flex}
          onPress={() => setSheet('more')}
        />
      </View>

      <BallSheet
        visible={sheet === 'wicket' || sheet === 'custom'}
        title={sheet === 'wicket' ? 'Wicket' : 'Custom ball'}
        ctx={{ ...ctx, dismissals: inputs.availableDismissals }}
        initial={{ bat: 0, extra: mode, extraRuns: 0, overthrows: 0, wicket: null }}
        startWithWicket={sheet === 'wicket'}
        name={name}
        onClose={() => setSheet(null)}
        onSubmit={record}
      />
      <MoreSheet
        visible={sheet === 'more'}
        state={state}
        innings={innings}
        name={name}
        append={append}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// One ball in full: wicket, custom ball, or an edit of a past ball
// ---------------------------------------------------------------------------

export interface BallContext {
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  bowlingXI: readonly PlayerId[];
  keeperId: PlayerId | null;
  /** Who may come in. Null when editing a past ball: the choice is then optional. */
  incoming: readonly PlayerId[] | null;
  finalWicket: boolean;
  dismissals: readonly DismissalKind[];
}

export function liveContext(
  state: MatchState,
  innings: InningsState,
): Omit<BallContext, 'dismissals'> {
  const bowling = squadOf(state, innings.bowlingTeamId);
  return {
    strikerId: innings.strikerId ?? '',
    nonStrikerId: innings.nonStrikerId ?? '',
    bowlingXI: bowling?.playingXI ?? [],
    keeperId: bowling?.keeperId ?? null,
    incoming: legalInputs(state).availableBatters,
    finalWicket: innings.wickets + 1 >= allOutWicketCount(state, innings),
  };
}

export function editContext(
  state: MatchState,
  innings: InningsState,
  striker: PlayerId,
  nonStriker: PlayerId,
): BallContext {
  const bowling = squadOf(state, innings.bowlingTeamId);
  return {
    strikerId: striker,
    nonStrikerId: nonStriker,
    bowlingXI: bowling?.playingXI ?? [],
    keeperId: bowling?.keeperId ?? null,
    incoming: null,
    finalWicket: false,
    dismissals: ALL_DISMISSALS,
  };
}

export function BallSheet(props: {
  visible: boolean;
  title: string;
  ctx: BallContext;
  initial: Draft;
  startWithWicket: boolean;
  name: Name;
  onClose: () => void;
  onSubmit: (delivery: Delivery) => Promise<boolean>;
  onDelete?: () => void;
  /** Batting XI, for the optional new batter when editing. */
  battingXI?: readonly PlayerId[];
}) {
  // Remount per opening so the form starts from `initial` each time.
  return (
    <Sheet visible={props.visible} title={props.title} onClose={props.onClose}>
      {props.visible && <BallForm {...props} />}
    </Sheet>
  );
}

function BallForm(props: Parameters<typeof BallSheet>[0]) {
  const { ctx, name, initial } = props;
  const opts = (ids: readonly PlayerId[]) => ids.map((p) => ({ value: p, label: name(p) }));
  const [extra, setExtra] = useState<ExtraMode>(initial.extra);
  const [bat, setBat] = useState<Runs>(initial.bat);
  const [extraRuns, setExtraRuns] = useState(initial.extraRuns);
  const [overthrows, setOverthrows] = useState(initial.overthrows);
  const [isWicket, setIsWicket] = useState(props.startWithWicket || initial.wicket !== null);
  const w = initial.wicket;
  const [kind, setKind] = useState<DismissalKind | null>(w?.kind ?? null);
  const [out, setOut] = useState<PlayerId | null>(w?.playerOutId ?? ctx.strikerId);
  const [fielder, setFielder] = useState<PlayerId | null>(w?.fielderIds?.[0] ?? null);
  const [crossed, setCrossed] = useState<'yes' | 'no' | null>(
    w?.battersCrossed === undefined ? null : w.battersCrossed ? 'yes' : 'no',
  );
  const [next, setNext] = useState<PlayerId | null>(w?.incomingBatterId ?? null);

  const batCounts = extra === 'none' || extra === 'noball';
  const eitherEnd = kind === 'run_out' || kind === 'obstructing';
  const needsFielder = kind !== null && requiresFielder(kind);
  const incomingOptions =
    ctx.incoming ??
    (props.battingXI ?? []).filter((p) => p !== ctx.strikerId && p !== ctx.nonStrikerId);
  const needsIncoming = ctx.incoming !== null && !ctx.finalWicket;

  const submit = async () => {
    let wicket: WicketInput | null = null;
    if (isWicket) {
      if (kind === null) return Alert.alert('How out?', 'Choose the dismissal.');
      if (out === null) return Alert.alert('Who is out?', 'Choose the batter.');
      if (needsFielder && fielder === null) return Alert.alert('Fielder', 'Choose the fielder.');
      if (kind === 'run_out' && crossed === null)
        return Alert.alert('Run out', 'Did the batters cross?');
      if (needsIncoming && next === null) return Alert.alert('New batter', 'Choose who comes in.');
      wicket = {
        kind,
        playerOutId: out,
        ...(needsFielder && fielder !== null ? { fielderIds: [fielder] } : {}),
        ...(kind === 'run_out' ? { battersCrossed: crossed === 'yes' } : {}),
        ...(next !== null && !ctx.finalWicket ? { incomingBatterId: next } : {}),
      };
    }
    await props.onSubmit(
      draftDelivery({ bat: batCounts ? bat : 0, extra, extraRuns, overthrows, wicket }),
    );
  };

  return (
    <>
      <Text style={text.label}>Ball</Text>
      <Choice options={EXTRAS} value={extra} onChange={setExtra} />
      {batCounts && (
        <>
          <Text style={text.label}>Runs off the bat</Text>
          <Choice
            options={runOptions()}
            value={`${bat}`}
            onChange={(v) => setBat(Number(v) as Runs)}
          />
        </>
      )}
      {extra !== 'none' && (
        <>
          <Text style={text.label}>
            {extra === 'wide'
              ? 'Runs run on the wide'
              : extra === 'noball'
                ? 'Byes off the no ball'
                : 'Runs run'}
          </Text>
          <Choice
            options={runOptions()}
            value={`${extraRuns as Runs}`}
            onChange={(v) => setExtraRuns(Number(v))}
          />
        </>
      )}
      <Text style={text.label}>Overthrows</Text>
      <Choice
        options={runOptions()}
        value={`${overthrows as Runs}`}
        onChange={(v) => setOverthrows(Number(v))}
      />

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: isWicket }}
        onPress={() => setIsWicket(!isWicket)}
        style={[styles.toggle, isWicket && { borderColor: C.wicket }]}
      >
        <Ionicons
          name={isWicket ? 'checkbox' : 'square-outline'}
          size={22}
          color={isWicket ? C.wicket : C.muted}
        />
        <Text style={[text.body, { fontWeight: '700' }]}>Wicket on this ball</Text>
      </Pressable>

      {isWicket && (
        <>
          <Text style={text.label}>How out</Text>
          <Choice
            options={ctx.dismissals.map((d) => ({ value: d, label: DISMISSAL_LABEL[d] }))}
            value={kind}
            onChange={(k) => {
              setKind(k);
              if (k === 'stumped') setFielder(ctx.keeperId);
              if (k !== 'run_out' && k !== 'obstructing') setOut(ctx.strikerId);
            }}
          />
          {eitherEnd && (
            <>
              <Text style={text.label}>Who is out</Text>
              <Choice
                options={opts([ctx.strikerId, ctx.nonStrikerId])}
                value={out}
                onChange={setOut}
              />
            </>
          )}
          {needsFielder && (
            <>
              <Text style={text.label}>{kind === 'stumped' ? 'Keeper' : 'Fielder'}</Text>
              <Choice options={opts(ctx.bowlingXI)} value={fielder} onChange={setFielder} />
            </>
          )}
          {kind === 'run_out' && (
            <>
              <Text style={text.label}>Did the batters cross?</Text>
              <Choice
                options={[
                  { value: 'yes', label: 'Crossed' },
                  { value: 'no', label: 'Not crossed' },
                ]}
                value={crossed}
                onChange={setCrossed}
              />
            </>
          )}
          {!ctx.finalWicket && incomingOptions.length > 0 && (
            <>
              <Text style={text.label}>New batter{needsIncoming ? '' : ' (if changed)'}</Text>
              <Choice options={opts(incomingOptions)} value={next} onChange={setNext} />
            </>
          )}
          {ctx.finalWicket && <Text style={text.muted}>Last wicket: the innings ends.</Text>}
        </>
      )}

      <Button
        label="Save ball"
        icon="checkmark"
        variant={isWicket ? 'danger' : 'primary'}
        size="lg"
        onPress={submit}
      />
      {props.onDelete !== undefined && (
        <Button label="Delete this ball" icon="trash" variant="ghost" onPress={props.onDelete} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Less common actions
// ---------------------------------------------------------------------------

function MoreSheet(props: {
  visible: boolean;
  state: MatchState;
  innings: InningsState;
  name: Name;
  append: Append;
  onClose: () => void;
}) {
  const { state, innings, name, append } = props;
  const [view, setView] = useState<'menu' | 'retire' | 'penalty'>('menu');
  const close = () => {
    setView('menu');
    props.onClose();
  };
  const run = async (payload: Payload) => {
    if (await append(payload)) close();
  };
  const confirm = (title: string, message: string, payload: Payload) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: title, style: 'destructive', onPress: () => run(payload) },
    ]);

  return (
    <Sheet
      visible={props.visible}
      title={view === 'retire' ? 'Retire batter' : view === 'penalty' ? 'Penalty runs' : 'More'}
      onClose={close}
    >
      {view === 'menu' && (
        <>
          <MenuItem
            icon="swap-horizontal"
            label="Swap strike"
            onPress={() => run({ kind: 'strike.swapped' })}
          />
          <MenuItem
            icon="medkit"
            label="Retire batter"
            hint="Retired hurt can bat again later"
            onPress={() => setView('retire')}
          />
          <MenuItem
            icon="flag"
            label="Penalty runs"
            hint="5 runs to either side"
            onPress={() => setView('penalty')}
          />
          <MenuItem
            icon="stop-circle"
            label="End innings now"
            hint="Close this innings with the current score"
            onPress={() =>
              confirm(
                'End innings',
                `${innings.battingTeamId} finish on ${innings.runs}/${innings.wickets}.`,
                { kind: 'innings.closed', reason: 'declared' },
              )
            }
          />
          <MenuItem
            icon="rainy"
            label="Abandon match"
            hint="No result"
            danger
            onPress={() =>
              confirm('Abandon', 'The match ends with no result.', {
                kind: 'match.status.changed',
                status: 'abandoned',
              })
            }
          />
        </>
      )}
      {view === 'retire' && (
        <RetireForm state={state} innings={innings} name={name} onSubmit={run} />
      )}
      {view === 'penalty' && <PenaltyForm state={state} onSubmit={run} />}
    </Sheet>
  );
}

function MenuItem(props: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = props.danger === true ? C.wicket : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={props.icon} size={24} color={color} />
      <View style={styles.flex}>
        <Text style={[text.body, { color, fontWeight: '700' }]}>{props.label}</Text>
        {props.hint !== undefined && <Text style={text.muted}>{props.hint}</Text>}
      </View>
    </Pressable>
  );
}

function RetireForm(props: {
  state: MatchState;
  innings: InningsState;
  name: Name;
  onSubmit: (p: Payload) => void;
}) {
  const { innings, name } = props;
  const opts = (ids: readonly PlayerId[]) => ids.map((p) => ({ value: p, label: name(p) }));
  const atCrease = [innings.strikerId, innings.nonStrikerId].filter((p) => p !== null);
  const incoming = legalInputs(props.state).availableBatters;
  const [outgoing, setOutgoing] = useState<PlayerId | null>(null);
  const [reason, setReason] = useState<'retired_hurt' | 'retired_out'>('retired_hurt');
  const [next, setNext] = useState<PlayerId | null>(null);

  return (
    <>
      <Text style={text.label}>Batter leaving</Text>
      <Choice options={opts(atCrease)} value={outgoing} onChange={setOutgoing} />
      <Choice
        options={[
          { value: 'retired_hurt', label: 'Retired hurt' },
          { value: 'retired_out', label: 'Retired out' },
        ]}
        value={reason}
        onChange={setReason}
      />
      <Text style={text.label}>New batter</Text>
      {incoming.length === 0 ? (
        <Text style={text.muted}>Nobody is left to come in.</Text>
      ) : (
        <Choice options={opts(incoming)} value={next} onChange={setNext} />
      )}
      <Button
        label="Retire"
        variant="primary"
        size="lg"
        disabled={outgoing === null || next === null}
        onPress={() =>
          outgoing !== null &&
          next !== null &&
          props.onSubmit({
            kind: 'batter.replaced',
            outgoingId: outgoing,
            incomingId: next,
            reason,
          })
        }
      />
    </>
  );
}

function PenaltyForm(props: { state: MatchState; onSubmit: (p: Payload) => void }) {
  const teams = props.state.config.teams;
  const [team, setTeam] = useState<string>(teams[0]);
  const [runs, setRuns] = useState('5');
  const [reason, setReason] = useState('');
  return (
    <>
      <Text style={text.label}>Runs awarded to</Text>
      <Choice
        options={teams.map((t) => ({ value: t, label: t }))}
        value={team}
        onChange={setTeam}
      />
      <Choice
        options={['1', '2', '5'].map((r) => ({ value: r, label: `${r} runs` }))}
        value={runs}
        onChange={setRuns}
      />
      <Field
        label="Reason"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. ball hit helmet"
      />
      <Button
        label="Award penalty"
        variant="primary"
        size="lg"
        onPress={() =>
          props.onSubmit({
            kind: 'penalty.awarded',
            teamId: team,
            runs: Number(runs),
            reason: reason.trim() || 'Penalty',
          })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 12 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  runKey: {
    flexBasis: '30%',
    flexGrow: 1,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runText: { color: C.text, fontSize: 32, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: C.raised,
  },
  pickName: { color: C.text, fontSize: 16, fontWeight: '700' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
});
