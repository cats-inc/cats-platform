import type { MessageLocale } from '../../../shared/i18n/index.js';
import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import type { CatlasInferenceReceipt } from '../../../platform/catlas/inference.js';

export const CODE_CATLAS_HELP_PATH = '/api/code/catlas/help';

export interface CodeCatlasHelpRequest {
  locale: MessageLocale;
  question: string;
  draft: {
    cwd: string | null;
    target: { provider: string; instance: string | null; model: string | null } | null;
    policy: RuntimeSessionPolicy;
  };
}

export type CodeCatlasHelpReason =
  | 'catlas_disabled' | 'knowledge_unavailable' | 'runtime_unavailable'
  | 'model_unavailable' | 'busy' | 'cancelled' | 'timeout' | 'invalid_response';

export interface CodeCatlasHelpResponse {
  source: 'model' | 'basic';
  advice: string;
  reason: CodeCatlasHelpReason | null;
  knowledgeIds: string[];
  receipt: CatlasInferenceReceipt | null;
}
