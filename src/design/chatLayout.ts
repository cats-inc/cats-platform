export type ChatLayoutMode =
  | 'solo'
  | 'direct_lane'
  | 'companion'
  | 'multi_cat';

export type SecondarySurfacePosition = 'side' | 'bottom' | 'hidden';

export interface LayoutMetrics {
  mode: ChatLayoutMode;
  sidebarWidth: 'collapsed' | 'standard' | 'wide';
  transcriptMaxWidth: string;
  secondarySurfacePosition: SecondarySurfacePosition;
  catStatusRowVisible: boolean;
  composerVariant: 'solo' | 'mention_enabled' | 'direct';
}

const NARROW_BREAKPOINT = 768;

export function resolveLayoutMetrics(
  mode: ChatLayoutMode,
  viewportWidth: number,
): LayoutMetrics {
  const isNarrow = viewportWidth < NARROW_BREAKPOINT;

  // Owner directive (2026-05-01): unify transcript max-width to 720px across
  // all chat layout modes so draft, solo, direct-lane, companion, and
  // multi-cat surfaces present the same composer/transcript width and the
  // composer no longer jumps when sending the first message or switching
  // modes. Draft shells separately set the same CSS variable so they match.
  const transcriptMaxWidth = '720px';

  switch (mode) {
    case 'solo':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth,
        secondarySurfacePosition: 'hidden',
        catStatusRowVisible: false,
        composerVariant: 'solo',
      };

    case 'direct_lane':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth,
        secondarySurfacePosition: isNarrow ? 'bottom' : 'side',
        catStatusRowVisible: false,
        composerVariant: 'direct',
      };

    case 'companion':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth,
        secondarySurfacePosition: 'hidden',
        catStatusRowVisible: false,
        composerVariant: 'direct',
      };

    case 'multi_cat':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth,
        secondarySurfacePosition: isNarrow ? 'bottom' : 'side',
        catStatusRowVisible: true,
        composerVariant: 'mention_enabled',
      };
  }
}
