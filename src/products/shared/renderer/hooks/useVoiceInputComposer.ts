import { useCallback, useEffect, useRef, type RefObject } from 'react';

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

  const handleTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const current = valueRef.current;
      const el = textareaRef.current;
      let nextValue: string;
      let cursorPos: number;
      if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
        const start = el.selectionStart;
        const end = el.selectionEnd;
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

  const { supported, listening, start, stop, cancel } = useWebSpeechInput({
    onTranscript: handleTranscript,
    lang,
  });

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    if (disabled && listening) cancel();
  }, [disabled, listening, cancel]);

  return { supported, listening, toggle, textareaRef };
}
