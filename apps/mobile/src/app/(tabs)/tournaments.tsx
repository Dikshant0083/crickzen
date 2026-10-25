import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listTournaments, useFocusLoad } from '../../db';
import { C, radius } from '../../theme';
import { Button, Empty } from '../../ui';

export default function Tournaments() {
  const [tournaments] = useFocusLoad(listTournaments);

  return (
    <View style={styles.screen}>
      <Button
        label="New tournament"
        icon="trophy"
        variant="primary"
        size="lg"
        onPress={() => router.push('/tournament/new')}
      />
      <FlatList
        data={tournaments ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          tournaments === null ? undefined : (
            <Empty
              icon="trophy-outline"
              title="No tournaments yet"
              hint="Run a league or knockout with your saved teams."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="trophy" size={28} color={C.extra} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>
                {item.format === 'league' ? 'League' : 'Knockout'} · {item.teams.length} teams ·{' '}
                {item.overs} ov
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.faint} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 16 },
  list: { gap: 8, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  name: { color: C.text, fontSize: 17, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13, marginTop: 2 },
});
