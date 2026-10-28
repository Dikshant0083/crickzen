import { Appearance } from 'react-native';

/** Softer than pure neon on black: lifted greys and a calmer green read better at night. */
const dark = {
  bg: '#101513',
  surface: '#181F1C',
  raised: '#222B27',
  border: '#2C3732',
  text: '#EDF3EF',
  muted: '#98A79F',
  faint: '#66756D',
  accent: '#3DCB7F',
  onAccent: '#06180D',
  four: '#4EA8F5',
  six: '#A77BF3',
  wicket: '#F0596A',
  extra: '#F2AE3D',
  /** The deep-green score header, same role in both modes. */
  hero: '#0F4D36',
  onHero: '#F2FBF6',
  heroMuted: '#A8E3C7',
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
