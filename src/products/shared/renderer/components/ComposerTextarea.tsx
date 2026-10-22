import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type TextareaHTMLAttributes,
} from 'react';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

interface ComposerTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize: (element: HTMLTextAreaElement) => void;
}

/** Keep controlled clears, restored drafts and read-only mirrors sized like typed text. */
export const ComposerTextarea = forwardRef<HTMLTextAreaElement, ComposerTextareaProps>(
  function ComposerTextarea({ autoResize, ...props }, forwardedRef) {
    const [element, setElement] = useState<HTMLTextAreaElement | null>(null);
    const attach = useCallback((node: HTMLTextAreaElement | null) => {
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
      setElement(node);
    }, [forwardedRef]);

    useClientLayoutEffect(() => {
      if (element) autoResize(element);
    }, [autoResize, element, props.value]);

    useEffect(() => {
      if (!element || typeof ResizeObserver === 'undefined') return;
      let width = element.clientWidth;
      let frame: number | null = null;
      const observer = new ResizeObserver(() => {
        const nextWidth = element.clientWidth;
        if (nextWidth === width) return;
        width = nextWidth;
        // Width changes rewrap an unchanged draft. Ignore our own height changes.
        if (width > 0) {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            frame = null;
            autoResize(element);
          });
        }
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
      };
    }, [autoResize, element]);

    return <textarea {...props} ref={attach} />;
  },
);
