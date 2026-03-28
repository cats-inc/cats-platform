import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';

import { isScrollNearBottom } from '../../../../core/scrolling';

const NEAR_BOTTOM_PX = 80;

function findScrollContainer(element: HTMLDivElement | null): HTMLElement | null {
  return element?.closest('.canvas') as HTMLElement | null;
}

export function useTranscriptAutoScroll(options: {
  channelId: string;
  scrollKey: string;
}): {
  transcriptListRef: RefCallback<HTMLDivElement>;
} {
  const { channelId, scrollKey } = options;
  const [transcriptListElement, setTranscriptListElement] = useState<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const syncScrollState = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      shouldAutoScrollRef.current = true;
      return;
    }

    shouldAutoScrollRef.current = isScrollNearBottom({
      scrollTop: scrollContainer.scrollTop,
      clientHeight: scrollContainer.clientHeight,
      scrollHeight: scrollContainer.scrollHeight,
      threshold: NEAR_BOTTOM_PX,
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    syncScrollState();
  }, [syncScrollState]);

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
    if (!transcriptListElement) {
      return;
    }

    shouldAutoScrollRef.current = true;
    const frameId = requestAnimationFrame(() => {
      scrollToBottom();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [channelId, scrollToBottom, transcriptListElement]);

  useEffect(() => {
    if (!transcriptListElement || !shouldAutoScrollRef.current) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      scrollToBottom();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [scrollKey, scrollToBottom, transcriptListElement]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!transcriptListElement || !scrollContainer || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }

      scrollToBottom();
    });
    observer.observe(transcriptListElement);
    return () => {
      observer.disconnect();
    };
  }, [scrollToBottom, transcriptListElement]);

  return {
    transcriptListRef: setTranscriptListElement,
  };
}
