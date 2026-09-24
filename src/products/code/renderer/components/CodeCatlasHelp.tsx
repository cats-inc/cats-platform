import { useEffect, useRef, useState } from 'react';
import type { GuideCatRecord } from '../../../../core/types.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import {
  CODE_CATLAS_HELP_PATH,
  type CodeCatlasHelpRequest,
  type CodeCatlasHelpResponse,
} from '../../shared/catlasHelp.js';

export interface CodeCatlasHelpProps {
  guideCat: GuideCatRecord | null;
  disabled?: boolean;
  draft: CodeCatlasHelpRequest['draft'];
}

export function CodeCatlasHelp({ guideCat, disabled = false, draft }: CodeCatlasHelpProps) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CodeCatlasHelpResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const contextKey = JSON.stringify({
    draft, locale, disabled, guideCat: guideCat
      ? [guideCat.id, guideCat.status, guideCat.executionTarget, guideCat.modelSelection] : null,
  });

  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setResult(null);
    setFailed(false);
    return () => pending.current?.abort();
  }, [contextKey]);

  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
  }

  async function ask() {
    cancel();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setResult(null);
    setFailed(false);
    try {
      const response = await fetch(CODE_CATLAS_HELP_PATH, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          locale, draft, question: question.trim() || t(messageKeys.codeCatlasHelpDefaultQuestion),
        } satisfies CodeCatlasHelpRequest),
      });
      if (!response.ok) throw new Error('Catlas help request failed.');
      const body = await response.json() as CodeCatlasHelpResponse;
      if (!['model', 'basic'].includes(body.source) || typeof body.advice !== 'string') {
        throw new Error('Invalid Catlas help response.');
      }
      if (!controller.signal.aborted) setResult(body);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  if (!guideCat || guideCat.status === 'dismissed' || disabled) return null;
  if (!open) {
    return <button type="button" className="promptChip" onClick={() => setOpen(true)}>
      {t(messageKeys.codeCatlasHelpOpen)}
    </button>;
  }
  return (
    <section className="codeCatlasHelp" aria-label={t(messageKeys.codeCatlasHelpTitle)}>
      <div className="codeCatlasHelpHeader">
        <strong>{t(messageKeys.codeCatlasHelpTitle)}</strong>
        <button type="button" className="promptChip" onClick={() => { cancel(); setOpen(false); }}>
          {t(messageKeys.codeCatlasHelpClose)}
        </button>
      </div>
      <p className="codeCatlasHelpNote">{t(messageKeys.codeCatlasHelpContext)}</p>
      <label className="codeBuilderLabel">
        {t(messageKeys.codeCatlasHelpQuestion)}
        <textarea
          className="codeBuilderTextarea"
          value={question}
          maxLength={1_000}
          placeholder={t(messageKeys.codeCatlasHelpDefaultQuestion)}
          onChange={(event) => { cancel(); setQuestion(event.target.value); setResult(null); setFailed(false); }}
          onKeyDown={(event) => event.stopPropagation()}
          rows={2}
        />
      </label>
      <div className="chipRow">
        <button type="button" className="promptChip" disabled={busy} onClick={() => void ask()}>
          {t(busy ? messageKeys.codeCatlasHelpThinking : messageKeys.codeCatlasHelpAsk)}
        </button>
        {busy ? <button type="button" className="promptChip" onClick={cancel}>
          {t(messageKeys.codeCatlasHelpCancel)}
        </button> : null}
      </div>
      <div role="status" aria-live="polite">
        {failed || result?.source === 'basic' ? (
          <p className="codeCatlasHelpNote">{t(messageKeys.codeCatlasHelpFallback)}</p>
        ) : null}
        {result || failed ? (
          <p className="codeCatlasHelpAdvice">
            {result?.advice ?? t(messageKeys.codeCatlasHelpBasic)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
