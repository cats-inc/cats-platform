import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useToast } from '../../../../design/components/Toast.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
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

type VoiceInputI18n = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const ERROR_MESSAGE_KEYS: Record<string, MessageKey> = {
  'not-allowed': messageKeys.sharedVoiceInputErrorNotAllowed,
  'service-not-allowed': messageKeys.sharedVoiceInputErrorServiceNotAllowed,
  'audio-capture': messageKeys.sharedVoiceInputErrorAudioCapture,
  network: messageKeys.sharedVoiceInputErrorNetwork,
  'language-not-supported': messageKeys.sharedVoiceInputErrorLanguageNotSupported,
  permission_denied: messageKeys.sharedVoiceInputErrorPermissionDenied,
  permission_not_determined: messageKeys.sharedVoiceInputErrorPermissionNotDetermined,
  mic_unavailable: messageKeys.sharedVoiceInputErrorMicUnavailable,
  language_not_supported: messageKeys.sharedVoiceInputErrorLanguageNotSupported,
  engine_unavailable: messageKeys.sharedVoiceInputErrorEngineUnavailable,
  helper_crashed: messageKeys.sharedVoiceInputErrorHelperCrashed,
};

function resolveVoiceErrorMessage(kind: string, t: VoiceInputI18n): string {
  const key = ERROR_MESSAGE_KEYS[kind];
  return key ? t(key) : t(messageKeys.sharedVoiceInputFailedWithKind, { kind });
}

function resolveVoicePrivacyMessage(
  mode: VoiceCaptureMode | null,
  t: VoiceInputI18n,
): string | null {
  if (mode === 'unknown') {
    return t(messageKeys.sharedVoiceInputPrivacyUnknown);
  }
  if (mode === 'cloud') {
    return t(messageKeys.sharedVoiceInputPrivacyCloud);
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
  const { t } = useI18n();
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
      showToast(resolveVoiceErrorMessage(kind, t));
    },
    [showToast, t],
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
  const privacyMessage = resolveVoicePrivacyMessage(privacyMode, t);

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
