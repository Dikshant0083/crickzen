import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { type Player, type Role, savePlayer } from './db';
import { ROLE } from './people';
import { isValidMobile, normalizeMobile } from './stats';
import { Button, Choice, Field } from './ui';

/** Add or edit a directory player. The mobile number is optional but must be unique. */
export function PlayerForm(props: {
  initial?: Player;
  initialName?: string;
  initialMobile?: string;
  onSaved: (player: Player) => void;
}) {
  const db = useSQLiteContext();
  const [name, setName] = useState(props.initial?.name ?? props.initialName ?? '');
  const [mobile, setMobile] = useState(props.initial?.mobile ?? props.initialMobile ?? '');
  const [role, setRole] = useState<Role>(props.initial?.role ?? 'batter');

  const save = async () => {
    const trimmed = name.trim();
    const normalized = normalizeMobile(mobile);
    if (trimmed === '') return Alert.alert('Name needed', 'Enter the player’s name.');
    if (!isValidMobile(normalized)) {
      return Alert.alert('Check the number', 'Mobile number should have 10 digits.');
    }
    const player: Player = {
      id: props.initial?.id ?? randomUUID(),
      name: trimmed,
      mobile: normalized,
      role,
    };
    const problem = await savePlayer(db, player);
    if (problem !== null) return Alert.alert('Already added', problem);
    props.onSaved(player);
  };

  return (
    <View style={{ gap: 16 }}>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rohit Sharma"
        autoFocus
      />
      <Field
        label="Mobile number (optional)"
        value={mobile}
        onChangeText={setMobile}
        placeholder="10-digit number"
        keyboardType="phone-pad"
        hint="Same number = same player in every match, so stats add up."
      />
      <Choice
        options={(Object.keys(ROLE) as Role[]).map((r) => ({ value: r, label: ROLE[r].label }))}
        value={role}
        onChange={setRole}
      />
      <Button
        label={props.initial === undefined ? 'Add player' : 'Save'}
        icon="checkmark"
        variant="primary"
        size="lg"
        onPress={save}
      />
    </View>
  );
}
