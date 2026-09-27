import type { CatsCoreState } from '../core/types.js';
import type { RuntimeClient } from '../platform/runtime/client.js';
import type { RuntimeSessionPolicy } from './runtimeSessionPolicy.js';

export interface ConversationSessionProjection {
  id: string; origin: string; archived: boolean; cwd: string | null; sessionId: string | null;
  workspaceKind: string | null; workspaceAccess: string | null; permissionMode: string | null;
}

/** Host-injected seam to the shared conversation engine, which is currently Chat-owned. */
export interface ConversationSessionDelegate {
  available: boolean;
  admit(input: { cwd: string; target: { provider: string; instance: string; model: string | null }; policy: RuntimeSessionPolicy },
    existing: (core: CatsCoreState) => string | null,
    persist: (core: CatsCoreState, channelId: string) => CatsCoreState): Promise<void>;
  inspect(channelId: string, check: (core: CatsCoreState, channel: ConversationSessionProjection | null) => boolean): Promise<boolean>;
  activate(channelId: string, runtime: RuntimeClient): Promise<void>;
}
