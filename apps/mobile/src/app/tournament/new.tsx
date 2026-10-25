import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createTournament, listTeams, type Team } from '../../db';
import { type Format, firstFixtures, type Playoffs, type Tournament } from '../../tournament';
import { Button, Card, Chip, Choice, Empty, Field, Segmented, text } from '../../ui';

const OVERS = ['5', '6', '8', '10', '12', '15', '20'] as const;

export default function NewTournament() {
  const db = useSQLiteContext();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>('league');
  const [legs, setLegs] = useState<'1' | '2'>('1');
  const [playoffs, setPlayoffs] = useState<Playoffs>('final');
  const [overs, setOvers] = useState('10');
  const [ball, setBall] = useState<'tennis' | 'leather'>('tennis');

  useEffect(() => {
    listTeams(db).then(setTeams);
  }, [db]);

  // Tap order is seeding order for a knockout.
  const chosen = picked.flatMap((id) => (teams ?? []).filter((t) => t.id === id));
  const draft: Tournament = {
    id: '',
    name: name.trim(),
    format,
    legs: legs === '2' ? 2 : 1,
    playoffs: format === 'league' ? playoffs : 'none',
    overs: Number(overs),
    ball,
    teams: chosen.map((t) => ({ id: t.id, name: t.name })),
    createdAt: '',
  };
  const preview =
    chosen.length >= 2 ? firstFixtures(draft).filter((f) => f.away !== null).length : 0;

  const create = async () => {
    const check = (m: string) => Alert.alert('Check the tournament', m);
    if (draft.name === '') return check('Give the tournament a name.');
    if (chosen.length < 2) return check('Pick at least 2 teams.');
    if (!Number.isInteger(draft.overs) || draft.overs < 1 || draft.overs > 50) {
      return check('Overs must be a whole number from 1 to 50.');
    }
    if (draft.playoffs === 'semis' && chosen.length < 4)
      return check('Semi-finals need at least 4 teams.');
    const t: Tournament = { ...draft, id: randomUUID(), createdAt: new Date().toISOString() };
    await createTournament(
      db,
      t,
      firstFixtures(t).map((f, seq) => ({
        ...f,
        id: randomUUID(),
        tournamentId: t.id,
        seq,
        matchId: null,
      })),
    );
    router.replace({ pathname: '/tournament/[id]', params: { id: t.id } });
  };

  if (teams !== null && teams.length < 2) {
    return (
      <View style={styles.screen}>
        <Empty
          icon="shield-outline"
          title="Save at least 2 teams first"
          hint="Tournaments use your saved teams."
        />
        <Button
          label="Go to Teams"
          icon="shield"
          variant="primary"
          onPress={() => router.replace('/teams')}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Field
        label="Tournament name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Sunday Premier League"
      />

      <Card title={`Teams · ${chosen.length}`}>
        <View style={styles.wrap}>
          {(teams ?? []).map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={picked.includes(t.id)}
              onPress={() =>
                setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))
              }
            />
          ))}
        </View>
        <Text style={text.muted}>For a knockout, pick teams in seeding order: best first.</Text>
      </Card>

      <Card title="Format">
        <Segmented
          options={[
            { value: 'league', label: 'League' },
            { value: 'knockout', label: 'Knockout' },
          ]}
          value={format}
          onChange={setFormat}
        />
        {format === 'league' && (
          <>
            <Choice
              options={[
                { value: '1', label: 'Play each team once' },
                { value: '2', label: 'Twice' },
              ]}
              value={legs}
              onChange={setLegs}
            />
            <Text style={text.label}>After the league</Text>
            <Choice
              options={[
                { value: 'none', label: 'Top of table wins' },
                { value: 'final', label: 'Final (top 2)' },
                { value: 'semis', label: 'Semis + final (top 4)' },
              ]}
              value={playoffs}
              onChange={setPlayoffs}
            />
          </>
        )}
        {preview > 0 && (
          <Text style={text.muted}>
            {preview} {format === 'league' ? 'league' : 'first-round'} matches
          </Text>
        )}
      </Card>

      <Card title="Match rules">
        <Choice
          options={OVERS.map((o) => ({ value: o, label: `${o} ov` }))}
          value={overs as (typeof OVERS)[number]}
          onChange={setOvers}
        />
        <Field
          label="Custom overs"
          value={overs}
          onChangeText={setOvers}
          keyboardType="number-pad"
        />
        <Choice
          options={[
            { value: 'tennis', label: 'Tennis ball' },
            { value: 'leather', label: 'Leather ball' },
          ]}
          value={ball}
          onChange={setBall}
        />
      </Card>

      <Button
        label="Create tournament"
        icon="trophy"
        variant="primary"
        size="lg"
        onPress={create}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 16, paddingBottom: 48 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
