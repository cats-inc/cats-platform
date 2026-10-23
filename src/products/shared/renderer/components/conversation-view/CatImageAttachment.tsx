import { useState } from 'react';
import { catImageAttachmentUrl, readCatImageAttachment } from '../../../../chat/shared/catImageAttachments.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';

export function CatImageAttachment({ metadata }: { metadata: Readonly<Record<string, unknown>> }) {
  const attachment = readCatImageAttachment(metadata);
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();
  if (!attachment) return null;
  return <figure className="catImageAttachment" style={{ margin: '8px 0' }}>
    {failed ? <span>{t(messageKeys.catImagesUnavailable)}</span> : <img
      src={catImageAttachmentUrl(attachment)} alt={t(messageKeys.catImagesGeneratedAlt)} loading="lazy"
      width={attachment.width} height={attachment.height} onError={() => setFailed(true)}
      style={{ display: 'block', maxWidth: 'min(100%, 360px)', maxHeight: '360px', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: '8px' }} />}
  </figure>;
}
