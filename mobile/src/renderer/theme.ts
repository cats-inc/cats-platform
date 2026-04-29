/**
 * Mobile design tokens. Mirrors the web design tokens enough to keep the
 * shell visually consistent with cats-platform desktop. Refined per phase
 * as more product surfaces land. Per PLAN-084 Phase 1.
 */

export const colors = {
  bg: {
    canvas: '#0F1115',
    surface: '#15171C',
    raised: '#1B1E25',
    overlay: 'rgba(0, 0, 0, 0.45)',
  },
  fg: {
    primary: '#F2F3F5',
    secondary: '#B8BCC4',
    muted: '#6E7480',
    inverse: '#0F1115',
  },
  border: {
    subtle: '#2A2D35',
    strong: '#3A3F4A',
  },
  accent: {
    primary: '#6EA8FF',
    primaryStrong: '#3D86F0',
    danger: '#E5484D',
    success: '#46A758',
    warning: '#E5A23B',
  },
  tab: {
    active: '#F2F3F5',
    inactive: '#6E7480',
    background: '#0F1115',
    border: '#2A2D35',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 24, lineHeight: 30, fontWeight: '600' as const },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export type ThemeColors = typeof colors;
export type ThemeSpacing = typeof spacing;
export type ThemeRadii = typeof radii;
export type ThemeTypography = typeof typography;

export const theme = {
  colors,
  spacing,
  radii,
  typography,
} as const;

export type Theme = typeof theme;
