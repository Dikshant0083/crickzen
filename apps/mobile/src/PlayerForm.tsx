import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { type Player, type Role, savePlayer } from './db';
import { ROLE } from './people';
import { isValidMobile, normalizeMobile } from './stats';
import { Button, Choice, Field } from './ui';

/** Adds a new player. The mobile number is required and unique: it links stats to the player's account. */
export function PlayerForm(props: {
  initialName?: string;
  initialMobile?: string;
  onSaved: (player: Player) => void;
}) {
  const db = useSQLiteContext();
  const [name, setName] = useState(props.initialName ?? '');
  const [mobile, setMobile] = useState(props.initialMobile ?? '');
  const [role, setRole] = useState<Role>('batter');

  const save = async () => {
    const trimmed = name.trim();
    const normalized = normalizeMobile(mobile);
    if (trimmed === '') return Alert.alert('Name needed', 'Enter the player’s name.');
    if (normalized === null) {
      return Alert.alert('Mobile needed', 'Their number links these stats to their account.');
    }
    if (!isValidMobile(normalized)) {
      return Alert.alert('Check the number', 'Mobile number should have 10 digits.');
    }
    const player: Player = {
      id: randomUUID(),
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
        label="Mobile number"
        value={mobile}
        onChangeText={setMobile}
        placeholder="10-digit number"
        keyboardType="phone-pad"
        hint="The player signs in with this number to see their stats."
      />
      <Choice
        options={(Object.keys(ROLE) as Role[]).map((r) => ({ value: r, label: ROLE[r].label }))}
        value={role}
        onChange={setRole}
      />
      <Button label="Add player" icon="checkmark" variant="primary" size="lg" onPress={save} />
    </View>
  );
}
