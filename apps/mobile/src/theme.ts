import { Appearance } from 'react-native';

const dark = {
  bg: '#0B0F0D',
  surface: '#141A17',
  raised: '#1C2420',
  border: '#26302B',
  text: '#F2F7F4',
  muted: '#8A9A91',
  faint: '#5A6861',
  accent: '#2EE67A',
  onAccent: '#04140A',
  four: '#3DA5FF',
  six: '#B46CFF',
  wicket: '#FF4D5E',
  extra: '#FFB020',
  /** The deep-green score header, same role in both modes. */
  hero: '#103A2A',
  onHero: '#F2F7F4',
  heroMuted: '#9FD9BC',
};

/** Light is the outdoor default: it stays readable in direct sun at the ground. */
const light: typeof dark = {
  bg: '#F2F5F3',
  surface: '#FFFFFF',
  raised: '#E8EEEA',
  border: '#D9E2DC',
  text: '#0E1A14',
  muted: '#52625A',
  faint: '#8A9A91',
  accent: '#0A8A4A',
  onAccent: '#FFFFFF',
  four: '#1E78D6',
  six: '#7C3AED',
  wicket: '#D93445',
  extra: '#B86E00',
  hero: '#085041',
  onHero: '#F2FBF6',
  heroMuted: '#9FE1CB',
};

export const isDark = Appearance.getColorScheme() === 'dark';

// shortcut: picked once at launch because every StyleSheet reads C at import; switching the phone's theme applies on next app start. Upgrade to a theme context if live switching is wanted.
export const C = isDark ? dark : light;

export const radius = { sm: 10, md: 14, lg: 20 } as const;
