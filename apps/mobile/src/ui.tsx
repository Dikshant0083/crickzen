import type { BallRecord } from '@criczen/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  type KeyboardTypeOptions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ballLabel } from './match';
import { initials } from './people';
import { C, radius } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Button(props: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'lg';
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const variant = props.variant ?? 'secondary';
  const bg = { primary: C.accent, secondary: C.raised, danger: C.wicket, ghost: 'transparent' }[
    variant
  ];
  const fg = variant === 'primary' ? C.onAccent : variant === 'danger' ? '#fff' : C.text;
  const lg = props.size === 'lg';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        lg && styles.buttonLg,
        variant === 'ghost' && styles.ghost,
        { backgroundColor: bg, opacity: props.disabled === true ? 0.35 : pressed ? 0.75 : 1 },
        props.style,
      ]}
    >
      {props.icon !== undefined && <Ionicons name={props.icon} size={lg ? 22 : 18} color={fg} />}
      <Text style={[styles.buttonText, lg && styles.buttonTextLg, { color: fg }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function Chip(props: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  badge?: string;
}) {
  const on = props.selected === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={props.onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{props.label}</Text>
      {props.badge !== undefined && <Text style={styles.chipBadge}>{props.badge}</Text>}
    </Pressable>
  );
}

/** Mutually exclusive chips. */
export function Choice<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {props.options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={o.value === props.value}
          onPress={() => props.onChange(o.value)}
        />
      ))}
    </View>
  );
}

export function Segmented<T extends string>(props: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card(props: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, props.style]}>
      {(props.title !== undefined || props.right !== undefined) && (
        <View style={styles.cardHead}>
          {props.title !== undefined && <Text style={styles.cardTitle}>{props.title}</Text>}
          {props.right}
        </View>
      )}
      {props.children}
    </View>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  hint?: string;
  autoFocus?: boolean;
  /** Passwords: hidden, no autocorrect, offered to the password manager. */
  secure?: boolean;
  /** Usernames and numbers: no auto-capitalising. */
  plain?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={C.faint}
        keyboardType={props.keyboardType}
        autoFocus={props.autoFocus}
        secureTextEntry={props.secure}
        autoCapitalize={props.secure === true || props.plain === true ? 'none' : 'sentences'}
        autoCorrect={props.secure !== true && props.plain !== true}
        textContentType={props.secure === true ? 'password' : undefined}
        style={styles.input}
      />
      {props.hint !== undefined && <Text style={styles.hint}>{props.hint}</Text>}
    </View>
  );
}

export function Empty(props: { icon: IconName; title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={props.icon} size={44} color={C.faint} />
      <Text style={styles.emptyTitle}>{props.title}</Text>
      {props.hint !== undefined && <Text style={styles.hint}>{props.hint}</Text>}
    </View>
  );
}

export function Stat(props: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{props.value}</Text>
      <Text style={styles.statLabel}>{props.label}</Text>
    </View>
  );
}

export function ballColor(ball: BallRecord): string {
  if (ball.wicket !== null) return C.wicket;
  if (ball.extra?.type === 'wide' || ball.extra?.type === 'noball') return C.extra;
  if (ball.runsOffBat === 6) return C.six;
  if (ball.runsOffBat === 4) return C.four;
  return C.raised;
}

export function BallDot(props: { ball: BallRecord; size?: number }) {
  const bg = ballColor(props.ball);
  const size = props.size ?? 34;
  return (
    <View
      style={[
        styles.ball,
        { backgroundColor: bg, minWidth: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.ballText, { color: bg === C.raised ? C.text : '#fff' }]}>
        {ballLabel(props.ball)}
      </Text>
    </View>
  );
}

/** A panel sliding up from the bottom, for multi-step inputs like a wicket. */
export function Sheet(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={props.onClose}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{props.title}</Text>
            <Pressable
              onPress={props.onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {props.children}
          </ScrollView>
          {props.footer}
        </View>
      </View>
    </Modal>
  );
}

const TEAM_COLORS = [
  '#2EE67A',
  '#3DA5FF',
  '#B46CFF',
  '#FF8A3D',
  '#FF4D8D',
  '#22D3EE',
  '#FACC15',
  '#A3E635',
];

/** A stable colour per team name, so a side looks the same on every screen. */
export function teamColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TEAM_COLORS[h % TEAM_COLORS.length] ?? C.accent;
}

export function TeamBadge(props: { name: string; size?: number }) {
  const size = props.size ?? 36;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: teamColor(props.name),
        },
      ]}
    >
      <Text style={[styles.badgeText, { fontSize: size * 0.38 }]}>{initials(props.name)}</Text>
    </View>
  );
}

/**
 * A big word that pops and fades over the screen: FOUR!, SIX!, WICKET!.
 * A new `id` replays it; touches pass through.
 */
export function Celebration(props: { id: number; label: string; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (props.id === 0) return;
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 5 }),
      Animated.delay(500),
      Animated.timing(anim, { toValue: 2, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [props.id, anim]);
  if (props.id === 0) return null;
  return (
    <View pointerEvents="none" style={styles.celebrateWrap}>
      <Animated.Text
        accessibilityLiveRegion="polite"
        style={[
          styles.celebrate,
          {
            color: props.color,
            opacity: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
            transform: [
              { scale: anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.3] }) },
            ],
          },
        ]}
      >
        {props.label}
      </Animated.Text>
    </View>
  );
}

export const text = StyleSheet.create({
  h1: { color: C.text, fontSize: 28, fontWeight: '800' },
  h2: { color: C.text, fontSize: 20, fontWeight: '700' },
  body: { color: C.text, fontSize: 16 },
  muted: { color: C.muted, fontSize: 14 },
  label: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#04140A', fontWeight: '900' },
  celebrateWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrate: {
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 12,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonLg: { minHeight: 56, borderRadius: radius.md },
  ghost: { borderWidth: 1, borderColor: C.border },
  buttonText: { fontSize: 15, fontWeight: '700' },
  buttonTextLg: { fontSize: 17 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: C.onAccent },
  chipBadge: { color: C.extra, fontSize: 11, fontWeight: '800' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: C.raised },
  segmentText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  segmentTextOn: { color: C.accent },
  card: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  field: { gap: 6 },
  fieldLabel: { color: C.muted, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: C.raised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 16,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  hint: { color: C.faint, fontSize: 13 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { color: C.muted, fontSize: 16, fontWeight: '600' },
  stat: {
    flexGrow: 1,
    flexBasis: '28%',
    backgroundColor: C.raised,
    borderRadius: radius.sm,
    padding: 12,
  },
  statValue: { color: C.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 2 },
  ball: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  ballText: { fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  sheetBody: { gap: 16, paddingBottom: 8 },
});
