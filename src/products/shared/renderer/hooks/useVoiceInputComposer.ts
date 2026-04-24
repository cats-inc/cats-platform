import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useToast } from '../../../../design/components/Toast.js';
import { useWebSpeechInput } from './useWebSpeechInput.js';

export interface UseVoiceInputComposerOptions {
  value: string;
  onChange: (next: string) => void;
  autoResize: (element: HTMLTextAreaElement) => void;
  disabled?: boolean;
  lang?: string;
}

export interface UseVoiceInputComposerResult {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  toasts: ReturnType<typeof useToast>['toasts'];
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Check your system and browser permissions.',
  'service-not-allowed': 'Voice input is not available in this environment.',
  'audio-capture': 'No microphone was detected.',
  'network': 'Voice input could not reach the recognition service.',
  'language-not-supported': 'Voice input does not support the current language.',
};

function resolveVoiceErrorMessage(kind: string): string {
  return ERROR_MESSAGES[kind] ?? `Voice input failed (${kind}).`;
}

export function useVoiceInputComposer({
  value,
  onChange,
  autoResize,
  disabled,
  lang,
}: UseVoiceInputComposerOptions): UseVoiceInputComposerResult {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const hasUserSelectionRef = useRef(false);
  const trustedSelectionValueRef = useRef<string | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const markInteracted = () => {
      hasUserSelectionRef.current = true;
      trustedSelectionValueRef.current = valueRef.current;
    };
    const markInput = () => {
      hasUserSelectionRef.current = true;
      trustedSelectionValueRef.current = el.value;
    };
    el.addEventListener('focus', markInteracted);
    el.addEventListener('pointerdown', markInteracted);
    el.addEventListener('keydown', markInteracted);
    el.addEventListener('input', markInput);
    return () => {
      el.removeEventListener('focus', markInteracted);
      el.removeEventListener('pointerdown', markInteracted);
      el.removeEventListener('keydown', markInteracted);
      el.removeEventListener('input', markInput);
    };
  }, []);

  useEffect(() => {
    if (trustedSelectionValueRef.current === null || trustedSelectionValueRef.current === value) {
      return;
    }
    hasUserSelectionRef.current = false;
    trustedSelectionValueRef.current = null;
  }, [value]);

  const handleTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const current = valueRef.current;
      const el = textareaRef.current;
      const selectionIsTrustworthy =
        !!el &&
        (typeof document !== 'undefined' && document.activeElement === el
          ? true
          : hasUserSelectionRef.current && trustedSelectionValueRef.current === current);
      let nextValue: string;
      let cursorPos: number;
      if (selectionIsTrustworthy && el) {
        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const needLeading = before.length > 0 && !/\s$/.test(before);
        const needTrailing = after.length > 0 && !/^\s/.test(after);
        const fragment = `${needLeading ? ' ' : ''}${trimmed}${needTrailing ? ' ' : ''}`;
        nextValue = `${before}${fragment}${after}`;
        cursorPos = before.length + fragment.length - (needTrailing ? 1 : 0);
      } else {
        const separator = current && !/\s$/.test(current) ? ' ' : '';
        nextValue = `${current}${separator}${trimmed}`;
        cursorPos = nextValue.length;
      }
      hasUserSelectionRef.current = true;
      trustedSelectionValueRef.current = nextValue;
      onChange(nextValue);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        autoResize(node);
        try {
          node.setSelectionRange(cursorPos, cursorPos);
        } catch {
          // selection APIs can throw on disabled or detached textareas
        }
      });
    },
    [onChange, autoResize],
  );

  const { toasts, showToast } = useToast();
  const handleRecognitionError = useCallback(
    (kind: string) => {
      showToast(resolveVoiceErrorMessage(kind));
    },
    [showToast],
  );

  const { supported, listening, start, stop, cancel } = useWebSpeechInput({
    onTranscript: handleTranscript,
    onError: handleRecognitionError,
    lang,
  });

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    if (disabled && listening) cancel();
  }, [disabled, listening, cancel]);

  return { supported, listening, toggle, textareaRef, toasts };
}
