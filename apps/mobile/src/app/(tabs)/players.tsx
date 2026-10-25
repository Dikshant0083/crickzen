import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { listPlayers, useFocusLoad } from '../../db';
import { initials, matchesQuery, ROLE } from '../../people';
import { C, radius } from '../../theme';
import { Button, Empty } from '../../ui';

export default function Players() {
  const [players] = useFocusLoad(listPlayers);
  const [query, setQuery] = useState('');
  const shown = (players ?? []).filter((p) => matchesQuery(p, query));

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={C.faint} />
          <TextInput
            accessibilityLabel="Search players by name or mobile"
            placeholder="Name or mobile number"
            placeholderTextColor={C.faint}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
          />
        </View>
        <Button
          label="Add"
          icon="person-add"
          variant="primary"
          onPress={() => router.push('/player/edit')}
        />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          players === null ? undefined : (
            <Empty
              icon="people-outline"
              title={query === '' ? 'No players yet' : 'No match'}
              hint="Add players once, then pick them for any match."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.avatar}>
              <Text style={styles.initials}>{initials(item.name)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>
                {ROLE[item.role].label}
                {item.mobile === null ? '' : `  ·  ${item.mobile}`}
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
  screen: { flex: 1, padding: 16, gap: 12 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 16, minHeight: 46 },
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: C.accent, fontWeight: '800', fontSize: 16 },
  flex: { flex: 1 },
  name: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13, marginTop: 2 },
});
