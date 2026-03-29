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

  switch (mode) {
    case 'solo':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth: '720px',
        secondarySurfacePosition: 'hidden',
        catStatusRowVisible: false,
        composerVariant: 'solo',
      };

    case 'direct_lane':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth: '720px',
        secondarySurfacePosition: isNarrow ? 'bottom' : 'side',
        catStatusRowVisible: false,
        composerVariant: 'direct',
      };

    case 'companion':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth: '680px',
        secondarySurfacePosition: 'hidden',
        catStatusRowVisible: false,
        composerVariant: 'direct',
      };

    case 'multi_cat':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth: '800px',
        secondarySurfacePosition: isNarrow ? 'bottom' : 'side',
        catStatusRowVisible: true,
        composerVariant: 'mention_enabled',
      };
  }
}
