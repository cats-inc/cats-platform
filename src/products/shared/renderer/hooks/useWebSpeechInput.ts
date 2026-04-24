import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const PERMANENT_ERROR_KINDS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
]);

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseWebSpeechInputOptions {
  onTranscript: (text: string) => void;
  lang?: string;
}

export interface UseWebSpeechInputResult {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function useWebSpeechInput({
  onTranscript,
  lang,
}: UseWebSpeechInputOptions): UseWebSpeechInputResult {
  const [supported, setSupported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);
  const [listening, setListening] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionTokenRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // already stopped or not started
    }
  }, []);

  const cancelCurrentRecognition = useCallback((updateListening: boolean) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    sessionTokenRef.current += 1;
    recognitionRef.current = null;
    if (updateListening) setListening(false);
    try {
      recognition.abort();
    } catch {
      // already stopped or not started
    }
  }, []);

  const cancel = useCallback(() => {
    cancelCurrentRecognition(true);
  }, [cancelCurrentRecognition]);

  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    const sessionToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = sessionToken;
    const isCurrentSession = () =>
      recognitionRef.current === recognition && sessionTokenRef.current === sessionToken;
    recognition.continuous = true;
    recognition.interimResults = false;
    if (lang) recognition.lang = lang;
    recognition.onresult = (event) => {
      if (!isCurrentSession()) return;
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) {
          finalText += result[0]?.transcript ?? '';
        }
      }
      if (finalText) onTranscriptRef.current(finalText);
    };
    recognition.onerror = (event) => {
      if (!isCurrentSession()) return;
      const kind = event?.error;
      if (kind) {
        if (PERMANENT_ERROR_KINDS.has(kind)) {
          console.warn(`[useWebSpeechInput] disabling after permanent error: ${kind}`);
          setSupported(false);
        } else {
          console.warn(`[useWebSpeechInput] transient error: ${kind}`);
        }
      }
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      if (!isCurrentSession()) return;
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, [lang]);

  useEffect(() => {
    return () => {
      cancelCurrentRecognition(false);
    };
  }, [cancelCurrentRecognition]);

  return { supported, listening, start, stop, cancel };
}
