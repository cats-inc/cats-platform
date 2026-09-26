import type { KnowledgeCandidatePreview as Preview } from '../../shared/knowledgeCandidatePreview.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';

export function KnowledgeCandidatePreview({ preview }: { preview: Preview }) {
  const { t } = useI18n();
  return (
    <section aria-label={t(messageKeys.codeKnowledgeDraftTitle)}>
      <h3>{t(messageKeys.codeKnowledgeDraftTitle)}</h3>
      <p>{t(messageKeys.codeKnowledgeDraftNotice)}</p>
      {preview.entries.map(entry => (
        <article className="operatorCard" key={entry.id}>
          <h4>{entry.id}</h4>
          <p lang="zh-TW" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.zhTW}</p>
          <details>
            <summary>English</summary>
            <p lang="en" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.en}</p>
          </details>
        </article>
      ))}
      <h4>{t(messageKeys.codeKnowledgeDraftLimits)}</h4>
      <ul>{preview.counterexamples.map((text, index) => <li key={index}>{text}</li>)}</ul>
    </section>
  );
}
