import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { DevTools } from '../DevTools';
import { listTeams, useFocusLoad } from '../db';
import { initials } from '../people';
import { C, radius } from '../theme';
import { Button, Empty } from '../ui';

export default function Teams() {
  const [teams, reload] = useFocusLoad(listTeams);

  return (
    <View style={styles.screen}>
      <Button
        label="New team"
        icon="add-circle"
        variant="primary"
        size="lg"
        onPress={() => router.push({ pathname: '/team/[id]', params: { id: 'new' } })}
      />
      <FlatList
        data={teams ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          teams === null ? undefined : (
            <Empty
              icon="shield-outline"
              title="No teams yet"
              hint="Save a team once, reuse it every match."
            />
          )
        }
        ListFooterComponent={<DevTools onChange={reload} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/team/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{item.playerIds.length} players</Text>
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
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: C.onAccent, fontWeight: '900', fontSize: 18 },
  name: { color: C.text, fontSize: 17, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13, marginTop: 2 },
});
