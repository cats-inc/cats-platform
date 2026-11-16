import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

import { useToast } from '../../../../design/components/Toast.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import type { VoiceCaptureMode } from '../../../../shared/voiceCaptureBridge.js';
import {
  canOpenDesktopSystemSettings,
  openDesktopSystemSettings,
  type DesktopSystemSettingsPane,
} from '../../../../shared/desktopSystemSettings.js';
import {
  isDesktopEnvironment,
  resolveDesktopHostBridge,
} from '../../../../shared/desktopRecoveryBridge.js';
import type { FeaturePackSnapshot } from '../../../../shared/featurePackBridge.js';
import {
  LINUX_STT_PACK_ID,
  OPTIONAL_DOWNLOADS_SETTINGS_PATH,
  resolveFeaturePackRequiredMessage,
} from '../../../../shared/featurePackLabels.js';
import { requestRendererNavigation } from '../../../../app/renderer/rendererNavigation.js';
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
  /** SPEC-145 FR-D5: recording stopped; the button is busy until the transcript lands. */
  processing: boolean;
  /** SPEC-145 FR-D5: the "Recording stops in N s" chip, or null. */
  limitWarningSeconds: number | null;
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
  speech_permission_denied: messageKeys.sharedVoiceInputErrorSpeechPermissionDenied,
  permission_not_determined: messageKeys.sharedVoiceInputErrorPermissionNotDetermined,
  mic_unavailable: messageKeys.sharedVoiceInputErrorMicUnavailable,
  language_not_supported: messageKeys.sharedVoiceInputErrorLanguageNotSupported,
  engine_unavailable: messageKeys.sharedVoiceInputErrorEngineUnavailable,
  helper_crashed: messageKeys.sharedVoiceInputErrorHelperCrashed,
};

// ADR-147: the System Settings pane that fixes a denied permission.
const SYSTEM_SETTINGS_PANES: Partial<Record<string, DesktopSystemSettingsPane>> = {
  permission_denied: 'microphone',
  speech_permission_denied: 'speech_recognition',
};

export function resolveVoiceErrorSystemSettingsPane(kind: string): DesktopSystemSettingsPane | null {
  return SYSTEM_SETTINGS_PANES[kind] ?? null;
}

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
  // SPEC-145 FR-C1: the toast names the pack's state and points to Settings. It
  // never starts a download, and the composer never waits for one.
  const showPackRequiredToast = useCallback(async () => {
    let snapshot: FeaturePackSnapshot | null = null;
    try {
      snapshot = await resolveDesktopHostBridge()?.featurePacks?.get(LINUX_STT_PACK_ID) ?? null;
    } catch {
      snapshot = null;
    }
    const message = resolveFeaturePackRequiredMessage(snapshot, t);
    showToast(message.text, message.openSettings
      ? { action: {
          label: t(messageKeys.sharedOpenSettings),
          onSelect: () => { requestRendererNavigation(OPTIONAL_DOWNLOADS_SETTINGS_PATH); },
        } }
      : undefined);
  }, [showToast, t]);
  const handleRecognitionError = useCallback(
    (kind: string) => {
      if (kind === 'pack_required') {
        void showPackRequiredToast();
        return;
      }
      const pane = resolveVoiceErrorSystemSettingsPane(kind);
      // On macOS the toast opens the pane; elsewhere the message stands alone.
      showToast(resolveVoiceErrorMessage(kind, t), pane && canOpenDesktopSystemSettings()
        ? { action: {
            label: t(messageKeys.sharedSystemSettingsOpen),
            onSelect: () => { void openDesktopSystemSettings(pane); },
          } }
        : undefined);
    },
    [showPackRequiredToast, showToast, t],
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
  // SPEC-145 FR-D1: the Desktop renderer never falls back to Web Speech, which
  // cannot transcribe in Electron. Without a native bridge it shows no button.
  // The Web deployment keeps Web Speech.
  const desktopRenderer = useMemo(() => isDesktopEnvironment(), []);
  const nativeChosen = nativeVoiceInput.supported || desktopRenderer;
  const voiceInput = nativeChosen ? nativeVoiceInput : webSpeechInput;
  const voiceInputActive = nativeChosen
    ? nativeVoiceInput.active
    : webSpeechInput.listening;
  const { supported, listening, start, stop, cancel } = voiceInput;
  const processing = nativeChosen && nativeVoiceInput.processing;

  const toggle = useCallback(() => {
    // While transcribing, the button is busy; Escape cancels instead.
    if (processing) return;
    if (voiceInputActive) stop();
    else start();
  }, [processing, voiceInputActive, start, stop]);

  useEffect(() => {
    if (disabled && voiceInputActive) cancel();
  }, [disabled, voiceInputActive, cancel]);

  useEffect(() => {
    const doc = textareaRef.current?.ownerDocument;
    if (!doc || !voiceInputActive) return;
    // The whole document listens: clicking the mic to stop moves focus to the
    // button, and Escape must still cancel while transcribing (FR-D5).
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !voiceInputActive) return;
      event.preventDefault();
      cancel();
    };
    doc.addEventListener('keydown', handleKeyDown);
    return () => {
      doc.removeEventListener('keydown', handleKeyDown);
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
    processing,
    limitWarningSeconds: nativeChosen ? nativeVoiceInput.limitWarningSeconds : null,
    privacyMode,
    privacyMessage,
  };
}
