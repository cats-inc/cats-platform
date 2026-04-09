import type { AssistantPresetRecord, CatsCoreState } from '../../core/types.js';
import type {
  ParsedAssistantPresetBody,
  ParsedGuideCatUpdateBody,
} from './platformSetupRouteSupport.js';

const GUIDE_CAT_PRIMARY_ID = 'guide-cat-primary';

export function upsertGuideCat(
  core: CatsCoreState,
  guideCat: ParsedGuideCatUpdateBody,
  nowIso: string,
): CatsCoreState {
  const existingId = core.guideCat?.id ?? GUIDE_CAT_PRIMARY_ID;
  return {
    ...core,
    updatedAt: nowIso,
    guideCat: {
      id: existingId,
      name: guideCat.name,
      status: core.guideCat?.status ?? 'active',
      executionTarget: {
        provider: guideCat.provider,
        instance: guideCat.instance,
        model: guideCat.model,
      },
      modelSelection: guideCat.modelSelection,
      createdAt: core.guideCat?.createdAt ?? nowIso,
      updatedAt: nowIso,
    },
  };
}

export function updateGuideCatStatus(
  core: CatsCoreState,
  status: 'active' | 'dismissed',
  nowIso: string,
): CatsCoreState | null {
  if (!core.guideCat) {
    return null;
  }

  return {
    ...core,
    updatedAt: nowIso,
    guideCat: {
      ...core.guideCat,
      status,
      updatedAt: nowIso,
    },
  };
}

export function clearGuideCat(core: CatsCoreState, nowIso: string): CatsCoreState {
  return {
    ...core,
    updatedAt: nowIso,
    guideCat: null,
  };
}

export function createAssistantPreset(
  core: CatsCoreState,
  assistantId: string,
  body: ParsedAssistantPresetBody,
  nowIso: string,
): { core: CatsCoreState; assistant: AssistantPresetRecord } {
  const assistant: AssistantPresetRecord = {
    id: assistantId,
    name: body.name,
    executionTarget: {
      provider: body.provider,
      instance: body.instance,
      model: body.model,
    },
    modelSelection: body.modelSelection,
    roleHint: body.roleHint,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    assistant,
    core: {
      ...core,
      updatedAt: nowIso,
      assistantPresets: [...core.assistantPresets, assistant],
    },
  };
}

export function updateAssistantPreset(
  core: CatsCoreState,
  assistantId: string,
  body: ParsedAssistantPresetBody,
  nowIso: string,
): { core: CatsCoreState; assistant: AssistantPresetRecord } | null {
  const existingAssistant = core.assistantPresets.find((assistant) => assistant.id === assistantId);
  if (!existingAssistant) {
    return null;
  }

  const assistant: AssistantPresetRecord = {
    ...existingAssistant,
    name: body.name,
    executionTarget: {
      provider: body.provider,
      instance: body.instance,
      model: body.model,
    },
    modelSelection: body.modelSelection,
    roleHint: body.roleHint,
    updatedAt: nowIso,
  };

  return {
    assistant,
    core: {
      ...core,
      updatedAt: nowIso,
      assistantPresets: core.assistantPresets.map((candidate) =>
        candidate.id === assistantId ? assistant : candidate
      ),
    },
  };
}

export function deleteAssistantPreset(
  core: CatsCoreState,
  assistantId: string,
  nowIso: string,
): { core: CatsCoreState; deletedId: string } | null {
  const nextAssistants = core.assistantPresets.filter((assistant) => assistant.id !== assistantId);
  if (nextAssistants.length === core.assistantPresets.length) {
    return null;
  }

  return {
    deletedId: assistantId,
    core: {
      ...core,
      updatedAt: nowIso,
      assistantPresets: nextAssistants,
    },
  };
}
