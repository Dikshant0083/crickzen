import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { type ColorValue, Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '../../theme';
import type { IconName } from '../../ui';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={icon} color={color as string} size={size} />
  ),
});

/** The centre slot: a raised button that opens a new match instead of switching tab. */
function StartButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start a match"
      onPress={() => router.push('/new')}
      style={styles.startSlot}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.start, pressed && { opacity: 0.8 }]}>
            <Ionicons name="add" size={30} color={C.onAccent} />
          </View>
          <Text style={styles.startLabel}>Start</Text>
        </>
      )}
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.hero },
        headerTintColor: C.onHero,
        headerTitleStyle: { fontWeight: '800', fontSize: 20 },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ ...tab('Home', 'home'), headerTitle: 'CrickScorer' }} />
      <Tabs.Screen name="matches" options={tab('Matches', 'baseball')} />
      <Tabs.Screen name="start" options={{ tabBarButton: () => <StartButton /> }} />
      <Tabs.Screen name="tournaments" options={tab('Cups', 'trophy')} />
      <Tabs.Screen name="me" options={tab('Me', 'person-circle')} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  startSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  start: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -22,
    backgroundColor: C.accent,
    borderWidth: 4,
    borderColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startLabel: { color: C.accent, fontSize: 10, fontWeight: '800' },
});
