/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2E241B',
    background: '#F7F1E5',
    backgroundElement: '#FFFBF2',
    backgroundSelected: '#EDE3D0',
    textSecondary: '#6F5F4E',
    accent: '#8A3B2A',
    onAccent: '#FFFBF2',
    danger: '#B3140F',
    border: '#D9CBB3',
    treeLine: '#8C7A64',
    shadow: 'rgba(46, 36, 27, 0.18)',
    scrim: 'rgba(46, 36, 27, 0.45)',
  },
  dark: {
    text: '#F3EADB',
    background: '#1E1812',
    backgroundElement: '#2A221A',
    backgroundSelected: '#3A2F24',
    textSecondary: '#BBAA95',
    accent: '#E0A48F',
    onAccent: '#2A1510',
    danger: '#FF8A7A',
    border: '#4A3D2F',
    treeLine: '#8F7F6B',
    shadow: 'rgba(0, 0, 0, 0.45)',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// The names the root layout loads each font under. global.css repeats them for the web's fallback stacks.
export const FontFaces = {
  serif: 'Lora-SemiBold',
  sans: 'SourceSans3-Regular',
  sansBold: 'SourceSans3-SemiBold',
} as const;

// Each weight is its own family, because Android and iOS pick font weights differently
export const Fonts = Platform.select({
  ios: {
    ...FontFaces,
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    ...FontFaces,
    mono: 'monospace',
  },
  web: {
    serif: 'var(--font-serif)',
    sans: 'var(--font-sans)',
    sansBold: 'var(--font-sans-bold)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 4,
  medium: 8,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
