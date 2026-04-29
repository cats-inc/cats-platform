/**
 * Mobile design tokens. Mirrors `cats-platform/src/design/tokens.css` so the
 * mobile shell looks consistent with the web renderer. Refined per phase as
 * more product surfaces land. Per PLAN-084 Phase 1 (corrected for the actual
 * web palette in Phase 2 — the Phase 1 dark draft did not match the web).
 */

export const colors = {
  bg: {
    app: '#FAFAF7',
    canvas: '#FAFAF7',
    sidebar: '#EDE9E1',
    panel: '#FFFFFF',
    panelHover: '#E8E4DC',
    panelSubtle: '#FBFAF8',
    surfaceRaised: 'rgba(255, 255, 255, 0.82)',
    overlay: 'rgba(15, 23, 42, 0.25)',
  },
  fg: {
    primary: '#1A1A1A',
    secondary: '#6B6560',
    muted: '#8C857D',
    inverse: '#FAFAF7',
  },
  border: {
    subtle: '#E4DFD7',
    strong: '#CFC9BE',
  },
  accent: {
    primary: '#C4653A',
    soft: 'rgba(196, 101, 58, 0.1)',
    danger: '#C0392B',
    dangerHover: '#A93226',
  },
  bubble: {
    user: '#EDE9DD',
    assistant: '#FFFFFF',
    assistantBorder: '#E4DFD7',
    mentionDefault: '#8B7E74',
    mentionText: '#FFFFFF',
  },
  status: {
    readyBg: 'rgba(61, 167, 121, 0.11)',
    readyText: '#207A53',
    warmBg: 'rgba(191, 146, 73, 0.12)',
    warmText: '#8D6830',
    mutedBg: 'rgba(122, 116, 108, 0.1)',
    mutedText: '#756D64',
  },
  tab: {
    active: '#1A1A1A',
    inactive: '#8C857D',
    background: '#FAFAF7',
    border: '#E4DFD7',
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
  bubble: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 24, lineHeight: 30, fontWeight: '600' as const },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  bubble: { fontSize: 14.7, lineHeight: 22, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  fileChip: { fontSize: 13.1, lineHeight: 18, fontWeight: '400' as const },
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
