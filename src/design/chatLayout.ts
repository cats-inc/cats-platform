export type ChatLayoutMode =
  | 'default_chat'
  | 'direct_message'
  | 'companion'
  | 'participant_chat';

export type SecondarySurfacePosition = 'side' | 'bottom' | 'hidden';

export interface LayoutMetrics {
  mode: ChatLayoutMode;
  sidebarWidth: 'collapsed' | 'standard' | 'wide';
  transcriptMaxWidth: string;
  secondarySurfacePosition: SecondarySurfacePosition;
  catStatusRowVisible: boolean;
  composerVariant: 'default' | 'mention_enabled' | 'direct';
}

const NARROW_BREAKPOINT = 768;

export function resolveLayoutMetrics(
  mode: ChatLayoutMode,
  viewportWidth: number,
): LayoutMetrics {
  const isNarrow = viewportWidth < NARROW_BREAKPOINT;

  // Owner directive (2026-05-01): unify transcript max-width to 720px across
  // all chat layout modes so draft, default chat, direct message, companion,
  // and participant chat surfaces present the same composer/transcript width and the
  // composer no longer jumps when sending the first message or switching
  // modes. Draft shells separately set the same CSS variable so they match.
  const transcriptMaxWidth = '720px';

  switch (mode) {
    case 'default_chat':
      return {
        mode,
        sidebarWidth: isNarrow ? 'collapsed' : 'standard',
        transcriptMaxWidth,
        secondarySurfacePosition: 'hidden',
        catStatusRowVisible: false,
        composerVariant: 'default',
      };

    case 'direct_message':
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

    case 'participant_chat':
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
