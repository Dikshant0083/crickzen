import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { hasDemoData, loadDemoData, removeDemoData } from './demo';
import { C, radius } from './theme';
import { Button, text } from './ui';

/**
 * Demo data for testing. Renders only in development (`__DEV__`, i.e. Expo Go
 * on the dev server); installed builds never show it.
 */
export function DevTools(props: { onChange: () => void }) {
  if (!__DEV__) return null;
  return <DemoButton onChange={props.onChange} />;
}

function DemoButton(props: { onChange: () => void }) {
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hasDemoData(db).then(setLoaded);
  }, [db]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const problem = await work();
      if (typeof problem === 'string') Alert.alert('Demo data', problem);
    } catch (e) {
      Alert.alert('Demo data', String(e));
    } finally {
      setLoaded(await hasDemoData(db));
      setBusy(false);
      props.onChange();
    }
  };

  if (loaded === null) return null;
  return (
    <View style={styles.box}>
      <Text style={text.label}>Developer only</Text>
      <Button
        label={busy ? 'Working…' : loaded ? 'Remove demo data' : 'Load demo data'}
        icon={loaded ? 'trash-outline' : 'flask-outline'}
        variant="ghost"
        disabled={busy}
        onPress={() => run(() => (loaded ? removeDemoData(db) : loadDemoData(db)))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 24,
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
  },
});
