import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';

import { isScrollNearBottom } from '../../../../core/scrolling.js';

const NEAR_BOTTOM_PX = 80;
const COMPOSER_CLEARANCE_PX = 12;

function findScrollContainer(element: HTMLDivElement | null): HTMLElement | null {
  return element?.closest('.canvas') as HTMLElement | null;
}

function readComposerOverlapInset(composerCardElement: HTMLElement): number {
  const bottomValue = Number.parseFloat(
    globalThis.getComputedStyle(composerCardElement).bottom || '0',
  );
  return Number.isFinite(bottomValue) ? Math.max(0, bottomValue) : 0;
}

function resolveNearBottomThreshold(composerCardElement: HTMLElement | null): number {
  if (!composerCardElement) {
    return NEAR_BOTTOM_PX;
  }
  return Math.ceil(NEAR_BOTTOM_PX + composerCardElement.getBoundingClientRect().height);
}

export function useTranscriptAutoScroll(options: {
  channelId: string;
  scrollKey: string;
  scrollOnChannelChange?: boolean;
}): {
  transcriptListRef: RefCallback<HTMLDivElement>;
  composerCardRef: RefCallback<HTMLElement>;
  bottomSentinelRef: RefCallback<HTMLDivElement>;
  isNearBottom: boolean;
  scrollToBottom: () => void;
} {
  const { channelId, scrollKey, scrollOnChannelChange = true } = options;
  const [transcriptListElement, setTranscriptListElement] = useState<HTMLDivElement | null>(null);
  const [composerCardElement, setComposerCardElement] = useState<HTMLElement | null>(null);
  const [bottomSentinelElement, setBottomSentinelElement] = useState<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const transcriptBottomInsetRef = useRef<number | null>(null);
  const composerBaselineHeightRef = useRef<number | null>(null);
  const composerFlowOffsetRef = useRef<number>(0);
  const bottomSentinelHeightRef = useRef<number | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);

  const syncScrollState = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      shouldAutoScrollRef.current = true;
      setIsNearBottom(true);
      return;
    }

    const nearBottom = isScrollNearBottom({
      scrollTop: scrollContainer.scrollTop,
      clientHeight: scrollContainer.clientHeight,
      scrollHeight: scrollContainer.scrollHeight,
      threshold: resolveNearBottomThreshold(composerCardElement),
    });
    shouldAutoScrollRef.current = nearBottom;
    setIsNearBottom(nearBottom);
  }, [composerCardElement]);

  const syncTranscriptBottomInset = useCallback(() => {
    if (!transcriptListElement) {
      transcriptBottomInsetRef.current = null;
      return;
    }

    const nextBottomInset = composerCardElement
      ? Math.ceil(readComposerOverlapInset(composerCardElement) + COMPOSER_CLEARANCE_PX)
      : 0;

    if (transcriptBottomInsetRef.current === nextBottomInset) {
      return;
    }

    transcriptBottomInsetRef.current = nextBottomInset;
    transcriptListElement.style.paddingBottom = nextBottomInset > 0
      ? `${nextBottomInset}px`
      : '';
  }, [composerCardElement, transcriptListElement]);

  const syncComposerDocking = useCallback(() => {
    if (!composerCardElement) {
      composerBaselineHeightRef.current = null;
      composerFlowOffsetRef.current = 0;
      return;
    }

    const composerHeight = Math.ceil(composerCardElement.getBoundingClientRect().height);
    if (composerHeight <= 0) {
      return;
    }

    const currentBaseline = composerBaselineHeightRef.current;
    const nextBaseline = currentBaseline == null
      ? composerHeight
      : Math.min(currentBaseline, composerHeight);
    composerBaselineHeightRef.current = nextBaseline;

    const nextComposerFlowOffset = Math.max(0, composerHeight - nextBaseline);
    if (composerFlowOffsetRef.current !== nextComposerFlowOffset) {
      composerFlowOffsetRef.current = nextComposerFlowOffset;
      composerCardElement.style.marginTop = nextComposerFlowOffset > 0
        ? `${-nextComposerFlowOffset}px`
        : '';
    }

    if (!bottomSentinelElement) {
      bottomSentinelHeightRef.current = Math.max(0, nextComposerFlowOffset);
      return;
    }

    const nextBottomSentinelHeight = Math.max(0, nextComposerFlowOffset);
    if (bottomSentinelHeightRef.current === nextBottomSentinelHeight) {
      return;
    }

    bottomSentinelHeightRef.current = nextBottomSentinelHeight;
    bottomSentinelElement.style.height = `${nextBottomSentinelHeight}px`;
  }, [bottomSentinelElement, composerCardElement]);

  const scrollToBottom = useCallback(() => {
    syncComposerDocking();
    syncTranscriptBottomInset();
    shouldAutoScrollRef.current = true;
    setIsNearBottom(true);

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
      return;
    }

    if (!bottomSentinelElement) {
      return;
    }

    bottomSentinelElement.scrollIntoView({ block: 'end' });
  }, [bottomSentinelElement, syncComposerDocking, syncTranscriptBottomInset]);

  const scheduleScrollToBottom = useCallback(() => {
    if (pendingScrollFrameRef.current !== null) {
      cancelAnimationFrame(pendingScrollFrameRef.current);
    }

    pendingScrollFrameRef.current = requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      scrollToBottom();
    });
  }, [scrollToBottom]);

  useEffect(() => {
    const scrollContainer = findScrollContainer(transcriptListElement);
    scrollContainerRef.current = scrollContainer;
    if (!scrollContainer) {
      return;
    }

    syncScrollState();
    const handleScroll = (): void => {
      syncScrollState();
    };
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollContainerRef.current === scrollContainer) {
        scrollContainerRef.current = null;
      }
    };
  }, [syncScrollState, transcriptListElement]);

  useEffect(() => {
    syncComposerDocking();
    syncTranscriptBottomInset();
    return () => {
      if (pendingScrollFrameRef.current !== null) {
        cancelAnimationFrame(pendingScrollFrameRef.current);
        pendingScrollFrameRef.current = null;
      }
      if (transcriptListElement) {
        transcriptListElement.style.paddingBottom = '';
      }
      if (composerCardElement) {
        composerCardElement.style.marginTop = '';
      }
      if (bottomSentinelElement) {
        bottomSentinelElement.style.height = '';
      }
      transcriptBottomInsetRef.current = null;
      composerBaselineHeightRef.current = null;
      composerFlowOffsetRef.current = 0;
      bottomSentinelHeightRef.current = null;
    };
  }, [bottomSentinelElement, composerCardElement, syncComposerDocking, syncTranscriptBottomInset, transcriptListElement]);

  useEffect(() => {
    if (!transcriptListElement || !scrollOnChannelChange) {
      return;
    }

    shouldAutoScrollRef.current = true;
    scheduleScrollToBottom();
    return undefined;
  }, [channelId, scrollOnChannelChange, scheduleScrollToBottom, transcriptListElement]);

  useEffect(() => {
    if (!transcriptListElement || !shouldAutoScrollRef.current) {
      return;
    }

    scheduleScrollToBottom();
    return undefined;
  }, [scrollKey, scheduleScrollToBottom, transcriptListElement]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!transcriptListElement || !scrollContainer || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncComposerDocking();
      syncTranscriptBottomInset();
      if (!shouldAutoScrollRef.current) {
        return;
      }

      scheduleScrollToBottom();
    });
    observer.observe(transcriptListElement);
    return () => {
      observer.disconnect();
    };
  }, [scheduleScrollToBottom, syncComposerDocking, syncTranscriptBottomInset, transcriptListElement]);

  useEffect(() => {
    if (!composerCardElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    syncComposerDocking();
    const observer = new ResizeObserver(() => {
      syncComposerDocking();
    });
    observer.observe(composerCardElement);
    return () => {
      observer.disconnect();
    };
  }, [composerCardElement, syncComposerDocking]);

  useEffect(() => {
    composerBaselineHeightRef.current = null;
    composerFlowOffsetRef.current = 0;
    bottomSentinelHeightRef.current = null;
    syncComposerDocking();
  }, [channelId, syncComposerDocking]);

  return {
    transcriptListRef: setTranscriptListElement,
    composerCardRef: setComposerCardElement,
    bottomSentinelRef: setBottomSentinelElement,
    isNearBottom,
    scrollToBottom,
  };
}
