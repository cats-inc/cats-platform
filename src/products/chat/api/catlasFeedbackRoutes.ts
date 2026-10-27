import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { recordCatlasSignals } from '../../../shared/guideCatCurationStore.js';
import { readGuideCatAssistConfig } from '../../../shared/guideCatAssistStore.js';
import { exactCatlasObject } from './catlasCuration.js';
import { GUIDE_CAT_ASSIST_SCOPE_KEYS } from '../../../shared/guideCatAssist.js';
import type { ChatApiRouteContext } from './routeSupport.js';

/** Owner feedback only: this endpoint grants no catalog mutation or agent authority. */
export async function routeCatlasFeedback(context: ChatApiRouteContext): Promise<boolean> {
  if (context.url.pathname !== '/api/catlas-assist/signals') return false;
  if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
  try {
    const body = exactCatlasObject(await readJsonBody<unknown>(context.request), ['scopeKey', 'basisIds', 'event']);
    if (typeof body.scopeKey !== 'string' || !Array.isArray(body.basisIds)
      || body.basisIds.length > 25 || !body.basisIds.every(id => typeof id === 'string' && id.length <= 160)
      || body.event !== 'accepted' && body.event !== 'dismissed') throw new Error('Invalid feedback');
    const [core, config, chat] = await Promise.all([context.dependencies.chatStore.readCore(),
      readGuideCatAssistConfig(context.dependencies.config.chatStatePath), context.dependencies.chatStore.read()]);
    if (core.guideCat && core.guideCat.status !== 'dismissed' && !config.disabledSurfaceKeys.includes(body.scopeKey)) {
      if (!Object.values(GUIDE_CAT_ASSIST_SCOPE_KEYS).includes(body.scopeKey as typeof GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault)) throw new Error('Unknown scope');
      // Feedback concerns basis IDs, not a transient recommendation revision. A slow
      // composer send must remain attributable after the background list is replaced.
      const known = new Set([...core.projects, ...core.workItems, ...core.tasks].map(record => record.id));
      for (const conversation of core.conversations) {
        if (['direct_message', 'private_escalation', 'external_transport'].includes(conversation.kind)) continue;
        const channel = chat.channels.find(item => item.id === conversation.sourceChannelId);
        if (channel && channel.channelKind !== 'direct_message') known.add(conversation.id);
      }
      const basis = [...new Set(body.basisIds as string[])].filter(id => known.has(id));
      await recordCatlasSignals(context.dependencies.config.chatStatePath, basis, body.event);
    }
    sendJson(context.response, 200, { ok: true });
  } catch { sendJson(context.response, 400, { error: 'Invalid Catlas feedback.' }); }
  return true;
}
