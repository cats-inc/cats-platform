import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useToast } from '../../../../design/components/Toast.js';
import type { VoiceCaptureMode } from '../../../../shared/voiceCaptureBridge.js';
import { useNativeVoiceInput } from './useNativeVoiceInput.js';
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
  privacyMode: VoiceCaptureMode | null;
  privacyMessage: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Check your system and browser permissions.',
  'service-not-allowed': 'Voice input is not available in this environment.',
  'audio-capture': 'No microphone was detected.',
  'network': 'Voice input could not reach the recognition service.',
  'language-not-supported': 'Voice input does not support the current language.',
  permission_denied: 'Microphone access was denied. Check your system voice permissions.',
  permission_not_determined: 'Voice input needs system microphone and speech permissions.',
  mic_unavailable: 'No microphone was detected.',
  language_not_supported: 'Voice input does not support the current language.',
  engine_unavailable: 'Voice input is not available on this device.',
  helper_crashed: 'Voice input stopped unexpectedly.',
};

function resolveVoiceErrorMessage(kind: string): string {
  return ERROR_MESSAGES[kind] ?? `Voice input failed (${kind}).`;
}

function resolveVoicePrivacyMessage(mode: VoiceCaptureMode | null): string | null {
  if (mode === 'unknown') {
    return 'Voice input may use Microsoft online speech depending on Windows privacy settings.';
  }
  if (mode === 'cloud') {
    return 'Voice input is using an online speech service.';
  }
  return null;
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

  const nativeVoiceInput = useNativeVoiceInput({
    onTranscript: handleTranscript,
    onError: handleRecognitionError,
    lang,
  });
  const webSpeechInput = useWebSpeechInput({
    onTranscript: handleTranscript,
    onError: handleRecognitionError,
    lang,
  });
  const voiceInput = nativeVoiceInput.supported ? nativeVoiceInput : webSpeechInput;
  const voiceInputActive = nativeVoiceInput.supported
    ? nativeVoiceInput.active
    : webSpeechInput.listening;
  const { supported, listening, start, stop, cancel } = voiceInput;

  const toggle = useCallback(() => {
    if (voiceInputActive) stop();
    else start();
  }, [voiceInputActive, start, stop]);

  useEffect(() => {
    if (disabled && voiceInputActive) cancel();
  }, [disabled, voiceInputActive, cancel]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !voiceInputActive) return;
      event.preventDefault();
      cancel();
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
    };
  }, [voiceInputActive, cancel]);

  const privacyMode = nativeVoiceInput.supported ? nativeVoiceInput.privacyMode : null;
  const privacyMessage = resolveVoicePrivacyMessage(privacyMode);

  return {
    supported,
    listening,
    toggle,
    textareaRef,
    toasts,
    privacyMode,
    privacyMessage,
  };
}
