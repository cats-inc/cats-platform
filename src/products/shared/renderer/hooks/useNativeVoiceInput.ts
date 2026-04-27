import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveDesktopHostBridge } from '../../../../shared/desktopRecoveryBridge.js';
import type {
  VoiceCaptureBridge,
  VoiceCaptureErrorReason,
  VoiceCaptureEvent,
  VoiceCaptureMode,
  VoiceCaptureSessionId,
} from '../../../../shared/voiceCaptureBridge.js';

const SILENT_NATIVE_ERROR_REASONS = new Set<VoiceCaptureErrorReason>([
  'cancelled',
  'aborted',
]);

type NativeVoiceStatus = 'idle' | 'starting' | 'ready';

function resolveVoiceCaptureBridge(): VoiceCaptureBridge | null {
  const bridge = resolveDesktopHostBridge();
  if (
    !bridge?.startVoiceCapture
    || !bridge.stopVoiceCapture
    || !bridge.cancelVoiceCapture
    || !bridge.onVoiceCaptureEvent
  ) {
    return null;
  }
  return {
    startVoiceCapture: bridge.startVoiceCapture,
    stopVoiceCapture: bridge.stopVoiceCapture,
    cancelVoiceCapture: bridge.cancelVoiceCapture,
    onVoiceCaptureEvent: bridge.onVoiceCaptureEvent,
  };
}

function createVoiceCaptureSessionId(): VoiceCaptureSessionId {
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return cryptoLike?.randomUUID?.() ?? `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UseNativeVoiceInputOptions {
  onTranscript: (text: string) => void;
  onError?: (reason: VoiceCaptureErrorReason) => void;
  lang?: string;
}

export interface UseNativeVoiceInputResult {
  supported: boolean;
  active: boolean;
  listening: boolean;
  privacyMode: VoiceCaptureMode | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function useNativeVoiceInput({
  onTranscript,
  onError,
  lang,
}: UseNativeVoiceInputOptions): UseNativeVoiceInputResult {
  const bridge = useMemo(() => resolveVoiceCaptureBridge(), []);
  const [status, setStatus] = useState<NativeVoiceStatus>('idle');
  const [privacyMode, setPrivacyMode] = useState<VoiceCaptureMode | null>(null);
  const activeSessionIdRef = useRef<VoiceCaptureSessionId | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const resetCurrentSession = useCallback((sessionId: VoiceCaptureSessionId) => {
    if (activeSessionIdRef.current !== sessionId) return;
    activeSessionIdRef.current = null;
    setStatus('idle');
    setPrivacyMode(null);
  }, []);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onVoiceCaptureEvent((event: VoiceCaptureEvent) => {
      if (event.sessionId !== activeSessionIdRef.current) return;
      switch (event.type) {
        case 'ready':
          setStatus('ready');
          setPrivacyMode(event.mode);
          break;
        case 'partial':
          break;
        case 'final':
          onTranscriptRef.current(event.text);
          break;
        case 'error':
          if (!SILENT_NATIVE_ERROR_REASONS.has(event.reason)) {
            onErrorRef.current?.(event.reason);
          }
          resetCurrentSession(event.sessionId);
          break;
        case 'end':
          resetCurrentSession(event.sessionId);
          break;
      }
    });
  }, [bridge, resetCurrentSession]);

  const cancelSession = useCallback(
    (updateState: boolean) => {
      const sessionId = activeSessionIdRef.current;
      if (!bridge || !sessionId) return;
      activeSessionIdRef.current = null;
      if (updateState) {
        setStatus('idle');
        setPrivacyMode(null);
      }
      void bridge.cancelVoiceCapture(sessionId).catch(() => {
        // Cleanup is best-effort after renderer cancellation.
      });
    },
    [bridge],
  );

  const start = useCallback(() => {
    if (!bridge || activeSessionIdRef.current) return;
    const sessionId = createVoiceCaptureSessionId();
    activeSessionIdRef.current = sessionId;
    setStatus('starting');
    setPrivacyMode(null);
    void bridge.startVoiceCapture({ sessionId, locale: lang }).catch(() => {
      if (activeSessionIdRef.current !== sessionId) return;
      activeSessionIdRef.current = null;
      setStatus('idle');
      setPrivacyMode(null);
      onErrorRef.current?.('engine_unavailable');
    });
  }, [bridge, lang]);

  const stop = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!bridge || !sessionId) return;
    void bridge.stopVoiceCapture(sessionId).catch(() => {
      if (activeSessionIdRef.current !== sessionId) return;
      activeSessionIdRef.current = null;
      setStatus('idle');
      setPrivacyMode(null);
      onErrorRef.current?.('engine_unavailable');
    });
  }, [bridge]);

  const cancel = useCallback(() => {
    cancelSession(true);
  }, [cancelSession]);

  useEffect(() => {
    return () => {
      cancelSession(false);
    };
  }, [cancelSession]);

  return {
    supported: bridge !== null,
    active: status !== 'idle',
    listening: status === 'ready',
    privacyMode,
    start,
    stop,
    cancel,
  };
}
