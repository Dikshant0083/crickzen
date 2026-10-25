import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { getPlayer, type Player } from '../../db';
import { PlayerForm } from '../../PlayerForm';

export default function EditPlayer() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [player, setPlayer] = useState<Player | null | undefined>(
    id === undefined ? null : undefined,
  );

  useEffect(() => {
    if (id !== undefined) getPlayer(db, id).then(setPlayer);
  }, [db, id]);

  if (player === undefined) return <ActivityIndicator style={{ padding: 24 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: player === null ? 'Add player' : 'Edit player' }} />
      <PlayerForm {...(player === null ? {} : { initial: player })} onSaved={() => router.back()} />
    </ScrollView>
  );
}
