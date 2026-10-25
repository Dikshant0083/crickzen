import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { listPlayers, loadAllMatches, useFocusLoad } from '../../db';
import { initials, matchesQuery, type RankBy, ROLE, rankPlayers } from '../../people';
import { C, radius } from '../../theme';
import { Empty, Segmented } from '../../ui';

const load = async (db: SQLiteDatabase) => ({
  players: await listPlayers(db),
  states: (await loadAllMatches(db)).map((m) => m.state),
});

export default function Players() {
  const [data] = useFocusLoad(load);
  const [query, setQuery] = useState('');
  const [by, setBy] = useState<RankBy>('overall');
  const players = data?.players ?? null;
  const shown = rankPlayers(players ?? [], data?.states ?? [], by).filter((p) =>
    matchesQuery(p, query),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={C.faint} />
          <TextInput
            accessibilityLabel="Search players by name or full mobile number"
            placeholder="Name or full mobile number"
            placeholderTextColor={C.faint}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
          />
        </View>
      </View>
      <Segmented
        options={[
          { value: 'overall', label: 'Overall' },
          { value: 'batting', label: 'Most runs' },
          { value: 'bowling', label: 'Most wickets' },
        ]}
        value={by}
        onChange={setBy}
      />
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          players === null ? undefined : (
            <Empty
              icon="people-outline"
              title={query === '' ? 'No players yet' : 'No match'}
              hint="Players are added from a team or match setup."
            />
          )
        }
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.rank}>{item.career.matches > 0 ? index + 1 : ''}</Text>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{initials(item.name)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>
                {ROLE[item.role].label}
                {item.career.matches === 0
                  ? '  ·  no matches yet'
                  : `  ·  ${item.career.batting.runs} runs  ·  ${item.career.bowling.wickets} wkts  ·  ${item.career.matches} M`}
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
  rank: { color: C.faint, fontWeight: '900', width: 22, textAlign: 'center' },
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
