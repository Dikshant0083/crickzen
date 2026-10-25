import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createMatch, listPlayers, listTeams, type Player, saveTeam, type Team } from '../db';
import { setupPayloads } from '../match';
import { PlayerPicker } from '../PlayerPicker';
import { C, radius } from '../theme';
import { Button, Card, Chip, Choice, Field, text } from '../ui';

interface Side {
  name: string;
  savedTeamId: string | null;
  players: Player[];
  captainId: string | null;
  keeperId: string | null;
}

const emptySide: Side = {
  name: '',
  savedTeamId: null,
  players: [],
  captainId: null,
  keeperId: null,
};
const OVERS = ['5', '6', '8', '10', '12', '15', '20', '50'] as const;

export default function NewMatch() {
  const db = useSQLiteContext();
  const [teams, setTeams] = useState<Team[]>([]);
  const [directory, setDirectory] = useState<Player[]>([]);
  const [sides, setSides] = useState<[Side, Side]>([emptySide, emptySide]);
  const [picking, setPicking] = useState<0 | 1 | null>(null);
  const [overs, setOvers] = useState('20');
  const [ball, setBall] = useState<'tennis' | 'leather'>('tennis');
  const [tossWinner, setTossWinner] = useState<'0' | '1' | null>(null);
  const [tossChoice, setTossChoice] = useState<'bat' | 'bowl' | null>(null);

  useEffect(() => {
    listTeams(db).then(setTeams);
    listPlayers(db).then(setDirectory);
  }, [db]);

  const update = (i: 0 | 1, fn: (s: Side) => Side) =>
    setSides((prev) => (i === 0 ? [fn(prev[0]), prev[1]] : [prev[0], fn(prev[1])]));

  const pickTeam = (i: 0 | 1, team: Team) => {
    const other = sides[i === 0 ? 1 : 0].players.map((p) => p.id);
    const players = team.playerIds
      .filter((pid) => !other.includes(pid))
      .flatMap((pid) => directory.filter((p) => p.id === pid));
    update(i, () => ({
      name: team.name,
      savedTeamId: team.id,
      players,
      captainId: null,
      keeperId: null,
    }));
  };

  const toggle = (i: 0 | 1, p: Player) => {
    setDirectory((d) => (d.some((x) => x.id === p.id) ? d : [...d, p]));
    update(i, (s) => {
      const has = s.players.some((x) => x.id === p.id);
      return {
        ...s,
        players: has ? s.players.filter((x) => x.id !== p.id) : [...s.players, p],
        captainId: has && s.captainId === p.id ? null : s.captainId,
        keeperId: has && s.keeperId === p.id ? null : s.keeperId,
      };
    });
  };

  const start = async () => {
    const check = (m: string) => Alert.alert('Check the setup', m);
    const names = sides.map((s) => s.name.trim()) as [string, string];
    const totalOvers = Number(overs);
    if (names[0] === '' || names[1] === '') return check('Enter both team names.');
    if (names[0].toLowerCase() === names[1].toLowerCase())
      return check('Team names must be different.');
    for (const s of sides) {
      if (s.players.length < 2) return check(`${s.name.trim()} needs at least 2 players.`);
      if (s.players.length > 15) return check(`${s.name.trim()} has more than 15 players.`);
    }
    if (!Number.isInteger(totalOvers) || totalOvers < 1 || totalOvers > 50) {
      return check('Overs must be a whole number from 1 to 50.');
    }
    if (tossWinner === null || tossChoice === null) return check('Record the toss.');

    // A new team name is saved, so it can be picked next time.
    for (const s of sides) {
      if (
        s.savedTeamId === null &&
        !teams.some((t) => t.name.toLowerCase() === s.name.trim().toLowerCase())
      ) {
        await saveTeam(db, {
          id: randomUUID(),
          name: s.name.trim(),
          playerIds: s.players.map((p) => p.id),
        });
      }
    }

    const squad = (s: Side) => {
      const ids = s.players.map((p) => p.id);
      const first = ids[0] ?? '';
      return { ids, names: {}, captainId: s.captainId ?? first, keeperId: s.keeperId ?? first };
    };
    const matchId = randomUUID();
    const error = await createMatch(
      db,
      matchId,
      { names: Object.fromEntries(sides.flatMap((s) => s.players.map((p) => [p.id, p.name]))) },
      setupPayloads({
        matchId,
        teams: names,
        squads: [squad(sides[0]), squad(sides[1])],
        overs: totalOvers,
        tennisBall: ball === 'tennis',
        tossWinner: tossWinner === '0' ? 0 : 1,
        tossChoice,
      }),
    );
    if (error !== null) return Alert.alert('Could not start the match', error);
    router.replace({ pathname: '/match/[id]', params: { id: matchId } });
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {([0, 1] as const).map((i) => {
        const side = sides[i];
        return (
          <Card key={i} title={`Team ${i + 1}`}>
            {teams.length > 0 && (
              <View style={styles.wrap}>
                {teams.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    selected={side.savedTeamId === t.id}
                    onPress={() => pickTeam(i, t)}
                  />
                ))}
              </View>
            )}
            <Field
              label="Team name"
              value={side.name}
              onChangeText={(name) => update(i, (s) => ({ ...s, name, savedTeamId: null }))}
              placeholder={teams.length > 0 ? 'Or type a new team' : 'e.g. Royal Strikers'}
            />
            <View style={styles.squadHead}>
              <Text style={text.label}>Playing XI · {side.players.length}</Text>
              <Button label="Add players" icon="person-add" onPress={() => setPicking(i)} />
            </View>
            {side.players.map((p) => (
              <View key={p.id} style={styles.playerRow}>
                <Text style={styles.player} numberOfLines={1}>
                  {p.name}
                </Text>
                <RoleTag
                  label="C"
                  on={(side.captainId ?? side.players[0]?.id) === p.id}
                  onPress={() => update(i, (s) => ({ ...s, captainId: p.id }))}
                />
                <RoleTag
                  label="WK"
                  on={(side.keeperId ?? side.players[0]?.id) === p.id}
                  onPress={() => update(i, (s) => ({ ...s, keeperId: p.id }))}
                />
              </View>
            ))}
            {side.players.length > 0 && (
              <Text style={text.muted}>Tap C / WK to set captain and keeper.</Text>
            )}
          </Card>
        );
      })}

      <Card title="Overs">
        <Choice
          options={OVERS.map((o) => ({ value: o, label: o }))}
          value={overs as (typeof OVERS)[number]}
          onChange={setOvers}
        />
        <Field
          label="Custom overs"
          value={overs}
          onChangeText={setOvers}
          keyboardType="number-pad"
        />
      </Card>

      <Card title="Ball">
        <Choice
          options={[
            { value: 'tennis', label: 'Tennis ball' },
            { value: 'leather', label: 'Leather ball' },
          ]}
          value={ball}
          onChange={setBall}
        />
        <Text style={text.muted}>
          {ball === 'tennis'
            ? 'Local rules: no free hit, super over on a tie.'
            : 'Laws of Cricket: free hit after a no-ball.'}
        </Text>
      </Card>

      <Card title="Toss">
        <Choice
          options={[
            { value: '0', label: sides[0].name.trim() || 'Team 1' },
            { value: '1', label: sides[1].name.trim() || 'Team 2' },
          ]}
          value={tossWinner}
          onChange={setTossWinner}
        />
        <Choice
          options={[
            { value: 'bat', label: 'Elected to bat' },
            { value: 'bowl', label: 'Elected to bowl' },
          ]}
          value={tossChoice}
          onChange={setTossChoice}
        />
      </Card>

      <Button label="Start match" icon="play" variant="primary" size="lg" onPress={start} />

      <PlayerPicker
        visible={picking !== null}
        title={`${sides[picking ?? 0].name.trim() || `Team ${(picking ?? 0) + 1}`} players`}
        selected={sides[picking ?? 0].players.map((p) => p.id)}
        unavailable={sides[picking === 1 ? 0 : 1].players.map((p) => p.id)}
        onToggle={(p) => picking !== null && toggle(picking, p)}
        onClose={() => setPicking(null)}
      />
    </ScrollView>
  );
}

function RoleTag(props: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.on }}
      accessibilityLabel={props.label === 'C' ? 'Make captain' : 'Make wicketkeeper'}
      onPress={props.onPress}
      hitSlop={6}
      style={[styles.tag, props.on && styles.tagOn]}
    >
      <Text style={[styles.tagText, props.on && { color: C.onAccent }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 16, paddingBottom: 48 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  squadHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  player: { flex: 1, color: C.text, fontSize: 16, fontWeight: '600' },
  tag: {
    minWidth: 40,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tagOn: { backgroundColor: C.accent, borderColor: C.accent },
  tagText: { color: C.muted, fontWeight: '800' },
});
