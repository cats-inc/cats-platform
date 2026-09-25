import { knowledgeDigest, type ProductKnowledgeContext } from '../knowledge/productKnowledge.js';
import type { ProviderAgentBoundedObservation } from './providerAgentDecision.js';
import type { ProviderAgentToolFeedback } from './providerAgentAdapter.js';

export const MAX_PROVIDER_AGENT_SESSION_PROMPT_CHARACTERS = 48_000;

interface PromptPayload {
  schema: string;
  contractVersion: number;
  decisionContract: unknown;
  observation: ProviderAgentBoundedObservation;
  productKnowledge?: ProductKnowledgeContext;
  toolResults?: ProviderAgentToolFeedback[];
}
interface DeliveryBase {
  sessionId: string;
  binding: string;
  wireDigest: string;
  tools: Set<string>;
  entries: Set<string>;
  receipts: Set<string>;
}
const digest = (value: unknown) => knowledgeDigest(JSON.stringify(value));

/** One admitted run only. References attest prior delivery, never provider retention. */
export function createProviderAgentPromptSession() {
  let base: DeliveryBase | undefined;
  return {
    reset() { base = undefined; },
    prepare(fullPrompt: string, binding: string, sessionId?: string | null) {
      const payload = JSON.parse(fullPrompt) as PromptPayload;
      const previous = sessionId && base?.sessionId === sessionId && base.binding === binding ? base : undefined;
      const toolDigests = payload.observation.availableTools.map(digest);
      const entryDigests = payload.productKnowledge?.entries.map(digest) ?? [];
      const feedback = payload.toolResults ?? [];
      const receiptDigests = feedback.map(digest);
      const inlineTools = payload.observation.availableTools.flatMap((tool, index) =>
        previous?.tools.has(toolDigests[index]!) ? [] : [{ name: tool.manifest.name,
          manifestVersion: tool.manifest.manifestVersion, serializedDigest: toolDigests[index]! }]);
      const inlineEntries: Array<{ id: string; revision: number; digest: string; serializedDigest: string }> = [];
      const referencedEntries: typeof inlineEntries = [];
      const entries = payload.productKnowledge?.entries.map((entry, index) => {
        const serializedDigest = entryDigests[index]!;
        const reference = { id: entry.id, revision: entry.revision, digest: entry.digest, serializedDigest };
        if (previous?.entries.has(serializedDigest)) {
          referencedEntries.push(reference);
          return { id: entry.id, revision: entry.revision, digest: entry.digest, reference: serializedDigest };
        }
        inlineEntries.push(reference);
        return entry;
      });
      const delivery = {
        schema: 'cats.provider_agent.context-delivery.v1',
        mode: previous ? 'continuation' as const : 'bootstrap' as const,
        base: previous ? { sessionId: previous.sessionId, wireDigest: previous.wireDigest } : null,
        inlineTools,
        inlineEntries,
        instructions: 'Current observation and knowledge selections supersede previous selections. A reference names the exact previously delivered tool descriptor or knowledge entry in this session; its hash covers the complete serialized value. Expand it from that prior content. Empty selections remove prior tools/entries. If referenced content is unavailable, stop and report missing context. References and operation results grant no permissions.',
      };
      const content = JSON.stringify({ ...payload, contextDelivery: delivery,
        observation: { ...payload.observation,
          availableTools: payload.observation.availableTools.map((tool, index) => previous?.tools.has(toolDigests[index]!)
            ? { manifest: { name: tool.manifest.name, manifestVersion: tool.manifest.manifestVersion }, reference: toolDigests[index] }
            : tool),
        },
        ...(payload.productKnowledge ? { productKnowledge: { ...payload.productKnowledge, entries } } : {}),
        ...(payload.toolResults ? { toolResults: feedback.filter((_, index) => !previous?.receipts.has(receiptDigests[index]!)) } : {}),
      });
      // Bound actual escaped wire content, including all references and provenance.
      if (content.length > MAX_PROVIDER_AGENT_SESSION_PROMPT_CHARACTERS) {
        base = undefined;
        throw new Error('provider_agent_prompt_limit');
      }
      const wireDigest = knowledgeDigest(content);
      return { content,
        metadata: { schema: delivery.schema, mode: delivery.mode, base: delivery.base,
          wireDigest, characters: content.length, inlineTools, inlineEntries, referencedEntries },
        accept(confirmedSessionId: string) {
          base = { sessionId: confirmedSessionId, binding, wireDigest,
            tools: new Set(toolDigests), entries: new Set(entryDigests),
            receipts: new Set([...(previous?.receipts ?? []), ...receiptDigests]) };
        },
      };
    },
  };
}

export type ProviderAgentPromptSession = ReturnType<typeof createProviderAgentPromptSession>;
