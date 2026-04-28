import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import type {
  GeneratedWorkPlan,
  WorkIntakeDraft,
} from '../src/products/work/intake/index.js';
import { generateWorkIntakePlan } from '../src/products/work/intake/index.js';
import {
  getWorkTemplate,
  type WorkTeamTemplate,
} from '../src/products/work/templates/index.js';

test('Work intake exports product-owned contract names', () => {
  const template = getWorkTemplate('software_delivery') as WorkTeamTemplate | null;
  assert.ok(template);

  const draft: WorkIntakeDraft = {
    title: 'Ship agent supervision',
    brief: 'Cut the Work intake slice without runtime ownership.',
    desiredOutcome: 'A generated plan can be reviewed in Work.',
    templateId: template.id,
    priority: 'medium',
  };

  const result = generateWorkIntakePlan(
    createDefaultCoreState(),
    draft,
    template,
    new Date('2026-04-28T08:00:00.000Z'),
  );
  const plan: GeneratedWorkPlan = result.plan;

  assert.equal(draft.templateId, 'software_delivery');
  assert.equal(plan.template.id, template.id);
});
