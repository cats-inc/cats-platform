export type VoiceCaptureSessionId = string;

export type VoiceCaptureMode = 'on-device' | 'cloud' | 'unknown';

export const VOICE_CAPTURE_ERROR_REASONS = [
  'permission_denied',
  'permission_not_determined',
  'mic_unavailable',
  'language_not_supported',
  'engine_unavailable',
  'helper_crashed',
  'cancelled',
  'aborted',
] as const;

export type VoiceCaptureErrorReason = typeof VOICE_CAPTURE_ERROR_REASONS[number];

export interface VoiceCaptureStartOptions {
  sessionId: VoiceCaptureSessionId;
  locale?: string;
}

export type VoiceCaptureEvent =
  | {
      type: 'ready';
      sessionId: VoiceCaptureSessionId;
      locale: string;
      mode: VoiceCaptureMode;
    }
  | {
      type: 'partial';
      sessionId: VoiceCaptureSessionId;
      text: string;
    }
  | {
      type: 'final';
      sessionId: VoiceCaptureSessionId;
      text: string;
    }
  | {
      type: 'error';
      sessionId: VoiceCaptureSessionId;
      reason: VoiceCaptureErrorReason;
    }
  | {
      type: 'end';
      sessionId: VoiceCaptureSessionId;
    };

export interface VoiceCaptureBridge {
  startVoiceCapture: (options: VoiceCaptureStartOptions) => Promise<void>;
  stopVoiceCapture: (sessionId: VoiceCaptureSessionId) => Promise<void>;
  cancelVoiceCapture: (sessionId: VoiceCaptureSessionId) => Promise<void>;
  onVoiceCaptureEvent: (handler: (event: VoiceCaptureEvent) => void) => () => void;
}
