export type {
  WorkTemplate,
  WorkTemplateApprovalExpectation,
  WorkTemplateRole,
  WorkTemplateTaskBlueprint,
} from './types.js';

import type { WorkTemplate } from './types.js';
import { WORK_TEMPLATE_SOFTWARE_DELIVERY } from './softwareDelivery.js';

const TEMPLATE_REGISTRY: ReadonlyMap<string, WorkTemplate> = new Map([
  [WORK_TEMPLATE_SOFTWARE_DELIVERY.id, WORK_TEMPLATE_SOFTWARE_DELIVERY],
]);

export function getWorkTemplate(id: string): WorkTemplate | null {
  return TEMPLATE_REGISTRY.get(id) ?? null;
}

export function listWorkTemplates(): WorkTemplate[] {
  return [...TEMPLATE_REGISTRY.values()];
}
