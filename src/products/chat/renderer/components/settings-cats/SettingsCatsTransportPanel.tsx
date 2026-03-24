import type {
  TelegramTransportDiagnostics,
  TelegramTransportStatus,
} from '../../api.js';
import { formatTransportTimestamp } from './shared.js';

export interface SettingsCatsTransportPanelProps {
  telegramDiagnostics: TelegramTransportDiagnostics | null;
  telegramError: string;
  telegramLoading: boolean;
  telegramStatus: TelegramTransportStatus | null;
  onRefresh: () => void;
}

export function SettingsCatsTransportPanel({
  telegramDiagnostics,
  telegramError,
  telegramLoading,
  telegramStatus,
  onRefresh,
}: SettingsCatsTransportPanelProps) {
  return (
    <>
      <div className="contentCardHeader">
        <div>
          <p className="sectionLabel">Transport</p>
          <h2>Telegram inbox</h2>
        </div>
        <button
          className="chromeButton"
          type="button"
          disabled={telegramLoading}
          onClick={onRefresh}
        >
          {telegramLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {telegramError ? <p className="feedbackText">{telegramError}</p> : null}
      {telegramStatus ? (
        <div className="catDetailPanel" style={{ marginBottom: 24 }}>
          <div className="catDetailSection">
            <p className="sectionLabel">Overview</p>
            <div className="catMeta">
              <span>{telegramStatus.status}</span>
              <span>
                {telegramStatus.delivery.status === 'configured'
                  ? 'Delivery ready'
                  : 'Delivery not configured'}
              </span>
              <span>
                {telegramStatus.roomRouting.roomRoutingStatus === 'linked_room'
                  ? 'Room linked'
                  : 'Room pending'}
              </span>
            </div>
            <p style={{ marginTop: 8 }}>{telegramStatus.note}</p>
            <p style={{ marginTop: 8, opacity: 0.7 }}>Webhook: {telegramStatus.webhookPath}</p>
            <p style={{ opacity: 0.7 }}>Diagnostics: {telegramStatus.diagnosticsPath}</p>
          </div>
          <div className="catDetailSection">
            <p className="sectionLabel">Ingress</p>
            <div className="catMeta">
              <span>Accepted {telegramStatus.ingress.acceptedUpdates}</span>
              <span>Ignored {telegramStatus.ingress.ignoredUpdates}</span>
              <span>
                {telegramStatus.ingress.secretTokenConfigured ? 'Secret configured' : 'No secret'}
              </span>
            </div>
            <p style={{ marginTop: 8, opacity: 0.7 }}>
              Last inbound: {formatTransportTimestamp(telegramStatus.ingress.lastReceipt?.acceptedAt)}
            </p>
            {telegramStatus.ingress.lastReceipt?.reason ? (
              <p style={{ opacity: 0.7 }}>
                Last inbound reason: {telegramStatus.ingress.lastReceipt.reason}
              </p>
            ) : null}
          </div>
          <div className="catDetailSection">
            <p className="sectionLabel">Delivery</p>
            <div className="catMeta">
              <span>Sent {telegramStatus.delivery.sentCount}</span>
              <span>Replies {telegramStatus.delivery.repliedCount}</span>
              <span>Failed {telegramStatus.delivery.failedCount}</span>
            </div>
            <p style={{ marginTop: 8, opacity: 0.7 }}>
              Last outbound: {formatTransportTimestamp(telegramStatus.delivery.lastReceipt?.deliveredAt)}
            </p>
            {telegramStatus.delivery.lastReceipt?.errorMessage ? (
              <p style={{ opacity: 0.7 }}>
                Last outbound error: {telegramStatus.delivery.lastReceipt.errorMessage}
              </p>
            ) : null}
          </div>
          {telegramDiagnostics ? (
            <div className="catDetailSection">
              <p className="sectionLabel">Bindings & dedupe</p>
              <div className="catMeta">
                <span>Tracked inboxes {telegramDiagnostics.bindings.length}</span>
                <span>
                  Dedupe {telegramDiagnostics.dedupe.retainedUpdateCount}/
                  {telegramDiagnostics.dedupe.maxRetainedUpdateCount}
                </span>
              </div>
              {telegramDiagnostics.bindings.length > 0 ? (
                <div className="memoryList" style={{ marginTop: 12 }}>
                  {telegramDiagnostics.bindings.slice(0, 3).map((binding) => (
                    <div key={binding.conversationId} className="memoryItem">
                      <div>
                        <strong>
                          {binding.botName ? `@${binding.botName}` : binding.telegramChatId}
                        </strong>
                        <span style={{ marginLeft: 8, opacity: 0.7 }}>
                          room {binding.linkedRoomId ?? 'pending'}
                        </span>
                      </div>
                      <span style={{ opacity: 0.7 }}>
                        {binding.lastInboundTextPreview ?? 'No inbound preview yet'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: 8, opacity: 0.6 }}>
                  No Telegram inbox bindings have received traffic yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
