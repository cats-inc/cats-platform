import type { RuntimeClient, RuntimeSessionCreateInput, RuntimeSessionResumeInput } from '../../runtime/client.js';

/** Request Claude in Chrome for sessions whose caller hosts approval cards.
 * Chat/Code conversations pass an interaction host themselves. Work admission
 * adds its host inside this wrapper, so supervised, scheduled and relay runs,
 * where nobody may be watching, never load browser tools. The client drops the
 * request for targets that do not advertise browser integration.
 */
export function withConversationBrowserIntegration(runtime: RuntimeClient, enabled: () => Promise<boolean>): RuntimeClient {
  const request = async <T extends RuntimeSessionCreateInput | RuntimeSessionResumeInput | undefined>(input: T): Promise<T> =>
    input?.interactionHost && await enabled().catch(() => false) ? { ...input, browserIntegration: true } : input;
  return new Proxy(runtime, {
    get(target, key) {
      if (key === 'createSession') {
        return async (input: RuntimeSessionCreateInput) => target.createSession(await request(input));
      }
      if (key === 'resumeSession' && target.resumeSession) {
        return async (sessionId: string, input?: RuntimeSessionResumeInput) => {
          const requested = await request(input);
          try { return await target.resumeSession!(sessionId, requested); } catch (error) {
            // A live worker keeps its launch choice, and the setting applies at the next
            // admission after it ends, so a changed setting resumes without it once.
            if (requested === input || (error as { status?: number; code?: string }).status !== 409
              || (error as { code?: string }).code !== 'interaction_conflict') throw error;
            return target.resumeSession!(sessionId, input);
          }
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
