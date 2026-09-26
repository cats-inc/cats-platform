import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';
import { getDesktopUpdateSnapshot } from '../../../../shared/desktopRecoveryBridge.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { isBrowserLiveTraceEnabled, readBrowserLiveTrace } from '../../../../shared/liveTrace.js';
import { diagnosticText, diagnosticTrace, readDiagnosticWithin, type ConversationDiagnosticReport } from '../../diagnosticReport.js';
import type { AppShellPayload } from '../../api/workspaceContracts.js';

interface DiagnosticAttachmentActionProps {
  payload: AppShellPayload;
  currentChannelId?: string | null;
  disabled: boolean;
  onAttach: (file: File) => void;
}

export function DiagnosticAttachmentAction({ payload, currentChannelId, disabled, onAttach }: DiagnosticAttachmentActionProps) {
  const { t } = useI18n();
  const channels = payload.chat.channels ?? [];
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(currentChannelId ?? channels[0]?.id ?? '');
  const [report, setReport] = useState<ConversationDiagnosticReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    return () => { requestRef.current?.abort(); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  async function collect() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    setLoading(true); setFailed(false); setReport(null);
    try {
      const [response, desktop] = await Promise.all([
        fetch(`/api/channels/${encodeURIComponent(selectedId)}/diagnostics`, {
          credentials: 'same-origin', signal: controller.signal,
        }),
        readDiagnosticWithin(getDesktopUpdateSnapshot, 1000),
      ]);
      if (!response.ok) throw new Error('Diagnostic collection failed');
      const result = await response.json() as ConversationDiagnosticReport;
      if (typeof result.text !== 'string' || result.text.length > 128 * 1024
        || !/^cats-diagnostics-\d+\.txt$/u.test(result.filename)) throw new Error('Invalid report');
      const browser = {
        capturedAt: new Date().toISOString(),
        view: diagnosticText(window.location.pathname, 300),
        destinationConversationId: currentChannelId ?? 'new conversation draft',
        desktopVersion: diagnosticText(desktop?.currentVersion, 80) ?? 'unavailable (web or older host)',
        browserTrace: isBrowserLiveTraceEnabled() ? diagnosticTrace(readBrowserLiveTrace(), selectedId) : 'unavailable (live trace disabled)',
        screenshot: 'not collected; use the existing screenshot attachment action',
      };
      if (!controller.signal.aborted) setReport({ ...result,
        text: [result.text, '', t(messageKeys.chatDiagnosticsRendererSection), JSON.stringify(browser, null, 2), ''].join('\n'),
      });
    } catch {
      if (requestRef.current === controller) setFailed(true);
    } finally {
      clearTimeout(timer);
      if (requestRef.current === controller) setLoading(false);
    }
  }

  return <>
    <button type="button" className="composerPlusMenuItem" disabled={disabled || !channels.length}
      onClick={() => { setReport(null); setFailed(false); setLoading(false); setOpen(true); }}>
      <span aria-hidden="true">＋</span>{t(messageKeys.chatDiagnosticsAction)}
    </button>
    {open ? <dialog ref={dialogRef} className="conversationDiagnosticsDialog"
      aria-label={t(messageKeys.chatDiagnosticsAction)} onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <h2>{t(messageKeys.chatDiagnosticsAction)}</h2>
      <p>{t(messageKeys.chatDiagnosticsHint)}</p>
      <label className="fieldLabel">
        {t(messageKeys.chatDiagnosticsConversation)}
        <select className="textInput" value={selectedId} disabled={loading}
          onChange={event => { setSelectedId(event.target.value); setReport(null); setFailed(false); }}>
          {channels.map(channel => <option key={channel.id} value={channel.id}>
            {channel.title} · {channel.id.slice(-8)}{channel.id === currentChannelId ? ` (${t(messageKeys.chatDiagnosticsCurrent)})` : ''}
          </option>)}
        </select>
      </label>
      {report ? <textarea className="textInput" rows={10} readOnly
        aria-label={t(messageKeys.chatDiagnosticsPreview)} value={report.text} /> : null}
      {failed ? <p role="alert">{t(messageKeys.chatDiagnosticsFailed)}</p> : null}
      <div className="conversationDiagnosticsActions">
        <button type="button" className="confirmCancelButton" onClick={() => setOpen(false)}>
          {t(messageKeys.chatDiagnosticsCancel)}
        </button>
        {report ? <button type="button" className="primaryButton" disabled={disabled}
          onClick={() => {
            onAttach(new File([report.text], report.filename, { type: 'text/plain' }));
            setOpen(false);
          }}>{t(messageKeys.chatDiagnosticsAttach)}</button>
          : <button type="button" className="primaryButton" disabled={disabled || loading || !selectedId}
            onClick={() => void collect()}>{t(loading ? messageKeys.chatDiagnosticsLoading : messageKeys.chatDiagnosticsCollect)}</button>}
      </div>
    </dialog> : null}
  </>;
}
