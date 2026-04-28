export type {
  WorkTemplate,
  WorkTemplateApprovalExpectation,
  WorkTemplateRole,
  WorkTemplateTaskBlueprint,
  WorkTeamTemplate,
} from './types.js';

import type { WorkTemplate } from './types.js';
import { WORK_TEMPLATE_SOFTWARE_DELIVERY } from './softwareDelivery.js';

export function createWorkTemplateRegistry(
  templates: readonly WorkTemplate[],
): ReadonlyMap<string, WorkTemplate> {
  const registry = new Map<string, WorkTemplate>();

  for (const template of templates) {
    if (registry.has(template.id)) {
      throw new Error(`Duplicate Work template id: ${template.id}`);
    }
    registry.set(template.id, template);
  }

  return registry;
}

const TEMPLATE_REGISTRY = createWorkTemplateRegistry([
  WORK_TEMPLATE_SOFTWARE_DELIVERY,
]);

export function getWorkTemplate(id: string): WorkTemplate | null {
  return TEMPLATE_REGISTRY.get(id) ?? null;
}

export function listWorkTemplates(): WorkTemplate[] {
  return [...TEMPLATE_REGISTRY.values()]
    .sort((left, right) => left.id.localeCompare(right.id));
}
