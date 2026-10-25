import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { listPlayers, type Player } from './db';
import { PlayerForm } from './PlayerForm';
import { initials, matchesQuery, ROLE } from './people';
import { C, radius } from './theme';
import { Button, Sheet } from './ui';

/**
 * Pick players from the directory by name or mobile number. A number nobody
 * has yet offers to create that player on the spot.
 */
export function PlayerPicker(props: {
  visible: boolean;
  title: string;
  selected: readonly string[];
  /** Players already taken, e.g. by the other team. */
  unavailable?: readonly string[];
  onToggle: (player: Player) => void;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => listPlayers(db).then(setPlayers), [db]);
  useEffect(() => {
    if (props.visible) load();
  }, [props.visible, load]);

  const shown = players.filter((p) => matchesQuery(p, query));
  const looksLikeNumber = /^[\d\s+()-]{6,}$/.test(query.trim());

  const close = () => {
    setAdding(false);
    setQuery('');
    props.onClose();
  };

  return (
    <Sheet
      visible={props.visible}
      title={adding ? 'New player' : props.title}
      onClose={close}
      footer={
        adding ? undefined : <Button label="Done" variant="primary" size="lg" onPress={close} />
      }
    >
      {adding ? (
        <PlayerForm
          {...(looksLikeNumber ? { initialMobile: query } : { initialName: query })}
          onSaved={(p) => {
            setAdding(false);
            setQuery('');
            load();
            props.onToggle(p);
          }}
        />
      ) : (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={C.faint} />
            <TextInput
              accessibilityLabel="Search by name or mobile number"
              placeholder="Name or mobile number"
              placeholderTextColor={C.faint}
              value={query}
              onChangeText={setQuery}
              style={styles.input}
            />
          </View>
          <Button
            icon="person-add"
            label={
              query.trim() === ''
                ? 'Add a new player'
                : looksLikeNumber
                  ? `Add new player with ${query.trim()}`
                  : `Add “${query.trim()}” as new player`
            }
            onPress={() => setAdding(true)}
          />
          {shown.map((p) => {
            const on = props.selected.includes(p.id);
            const taken = !on && props.unavailable?.includes(p.id) === true;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: taken }}
                disabled={taken}
                onPress={() => props.onToggle(p)}
                style={[styles.row, on && styles.rowOn, taken && { opacity: 0.4 }]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.initials}>{initials(p.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.sub}>
                    {taken ? 'In the other team' : ROLE[p.role].label}
                    {p.mobile === null ? '' : `  ·  ${p.mobile}`}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={on ? C.accent : C.faint}
                />
              </Pressable>
            );
          })}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.raised,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: C.text, fontSize: 16, minHeight: 46 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  rowOn: { borderColor: C.accent },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: C.accent, fontWeight: '800' },
  name: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13 },
});
