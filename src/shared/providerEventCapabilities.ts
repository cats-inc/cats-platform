import type {
  ProductProviderEventCapabilities,
  ProductProviderEventCapabilitySupport,
  ProductProviderTextStreamingMode,
} from './providerCatalog.js';

function describeTextMode(mode: ProductProviderTextStreamingMode): string | null {
  switch (mode) {
    case 'token':
      return 'token text';
    case 'chunk':
      return 'chunk text';
    case 'line':
      return 'line text';
    case 'final':
      return 'final-only text';
    default:
      return null;
  }
}

function describeSupport(
  label: string,
  support: ProductProviderEventCapabilitySupport,
): string | null {
  switch (support) {
    case 'native':
      return label;
    case 'derived':
      return `derived ${label}`;
    default:
      return null;
  }
}

function describePresentation(
  capabilities: ProductProviderEventCapabilities,
): string | null {
  switch (capabilities.presentation.recommended) {
    case 'event_tape':
      return 'Recommended host view: event tape.';
    case 'content_blocks':
      return 'Recommended host view: content blocks.';
    case 'final_message':
      return 'Recommended host view: final message.';
    default:
      return null;
  }
}

export function formatProviderEventCapabilitiesSummary(
  capabilities: ProductProviderEventCapabilities | null | undefined,
): string | null {
  if (!capabilities) {
    return null;
  }

  const surface = [
    describeTextMode(capabilities.normalizedStream.text.mode),
    describeSupport('tool use', capabilities.normalizedStream.toolUse),
    describeSupport('tool results', capabilities.normalizedStream.toolResult),
    describeSupport('progress', capabilities.normalizedStream.progress),
    describeSupport('reasoning', capabilities.normalizedStream.reasoning),
    describeSupport('transcript blocks', capabilities.transcript.contentBlocks),
  ].filter((value): value is string => Boolean(value));

  const summaryParts: string[] = [];
  if (surface.length > 0) {
    summaryParts.push(`Runtime event surface: ${surface.join(', ')}.`);
  }

  const presentation = describePresentation(capabilities);
  if (presentation) {
    summaryParts.push(presentation);
  }

  if (summaryParts.length === 0 && capabilities.notes[0]) {
    return capabilities.notes[0];
  }

  return summaryParts.length > 0 ? summaryParts.join(' ') : null;
}
