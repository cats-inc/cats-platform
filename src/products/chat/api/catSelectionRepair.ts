import type { RuntimeClient } from '../../../platform/runtime/client.js';
import type {
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../../shared/providerCatalog.js';
import {
  canClassifyCatalogSelection,
  classifyCatalogSelection,
} from '../../../shared/providerSelection.js';
import { setChannelParticipantExecutionTarget } from '../state/model/index.js';
import type { ChatCat, ChatState } from './contracts.js';

export interface CatSelectionCopy {
  channelId: string;
  participantId: string;
}

type CatalogReader = Pick<RuntimeClient, 'getProviderModels' | 'getAdvancedProviderModels'>;

/**
 * Chats keep their own copy of a cat's model choice. List the active copies of
 * this cat that the current catalog no longer offers; copies that still map,
 * including ones a chat changed on purpose, are left out.
 */
export async function findUnmappableCatSelectionCopies(
  runtimeClient: CatalogReader,
  state: ChatState,
  catId: string,
): Promise<CatSelectionCopy[]> {
  const catalogs = new Map<string, Promise<{
    catalog: ProviderModelCatalog;
    advancedCatalog: ProviderAdvancedModelCatalog;
  } | null>>();
  const readCatalogs = (provider: string, instance: string | null) => {
    const key = JSON.stringify([provider, instance]);
    let pair = catalogs.get(key);
    if (!pair) {
      pair = Promise.all([
        runtimeClient.getProviderModels(provider, instance),
        runtimeClient.getAdvancedProviderModels(provider, instance),
      ]).then(([catalog, advancedCatalog]) =>
        canClassifyCatalogSelection(catalog, advancedCatalog) ? { catalog, advancedCatalog } : null,
      () => null);
      catalogs.set(key, pair);
    }
    return pair;
  };

  const copies: CatSelectionCopy[] = [];
  for (const channel of state.channels) {
    for (const assignment of channel.catAssignments) {
      const selection = assignment.execution.modelSelection;
      const provider = assignment.execution.target.provider;
      if (assignment.catId !== catId || assignment.status !== 'active' || !selection || !provider) {
        continue;
      }
      const pair = await readCatalogs(provider, assignment.execution.target.instance ?? null);
      if (pair && classifyCatalogSelection({ selection, ...pair }).status === 'unmappable') {
        copies.push({ channelId: channel.id, participantId: assignment.participantId });
      }
    }
  }
  return copies;
}

/** Whether the cat's own saved choice is still offered, so its copies may take it. */
export async function catSelectionStillMaps(runtimeClient: CatalogReader, cat: ChatCat): Promise<boolean> {
  const selection = cat.defaultModelSelection;
  const provider = cat.defaultExecutionTarget.provider;
  if (!selection || !provider) {
    return false;
  }
  try {
    const instance = cat.defaultExecutionTarget.instance ?? null;
    const [catalog, advancedCatalog] = await Promise.all([
      runtimeClient.getProviderModels(provider, instance),
      runtimeClient.getAdvancedProviderModels(provider, instance),
    ]);
    return canClassifyCatalogSelection(catalog, advancedCatalog)
      && classifyCatalogSelection({ selection, catalog, advancedCatalog }).status !== 'unmappable';
  } catch {
    return false;
  }
}

/** Give the listed copies the cat's current saved target, skipping any that left the chat. */
export function repairCatSelectionCopies(
  state: ChatState,
  catId: string,
  copies: readonly CatSelectionCopy[],
  now: Date,
): ChatState {
  const cat = state.cats.find((candidate) => candidate.id === catId);
  if (!cat || copies.length === 0) {
    return state;
  }
  let nextState = state;
  for (const copy of copies) {
    const stillAssigned = nextState.channels.find((channel) => channel.id === copy.channelId)?.catAssignments
      .some((assignment) =>
        assignment.participantId === copy.participantId && assignment.catId === catId && assignment.status === 'active');
    if (!stillAssigned) {
      continue;
    }
    nextState = setChannelParticipantExecutionTarget(nextState, copy.channelId, copy.participantId, {
      provider: cat.defaultExecutionTarget.provider,
      instance: cat.defaultExecutionTarget.instance ?? null,
      model: cat.defaultExecutionTarget.model ?? null,
      modelSelection: cat.defaultModelSelection ?? null,
    }, now);
  }
  return nextState;
}
