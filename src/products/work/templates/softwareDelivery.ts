import type { WorkTemplate } from './types.js';

export const WORK_TEMPLATE_SOFTWARE_DELIVERY: WorkTemplate = {
  id: 'software_delivery',
  label: 'Software Delivery',
  description:
    'End-to-end software delivery workflow: planning, implementation, review, validation, and delivery.',
  version: 1,
  roles: [
    {
      key: 'boss',
      label: 'Boss / Operator Lead',
      productHint: 'work',
      strategyHint: null,
      required: true,
    },
    {
      key: 'pm',
      label: 'PM / Architect',
      productHint: 'work',
      strategyHint: 'pdca',
      required: true,
    },
    {
      key: 'implementer',
      label: 'Implementation',
      productHint: 'code',
      strategyHint: 'reflexion',
      required: true,
    },
    {
      key: 'reviewer',
      label: 'Review',
      productHint: 'code',
      strategyHint: 'reflexion',
      required: false,
    },
    {
      key: 'qa',
      label: 'QA / Validation',
      productHint: 'work',
      strategyHint: 'pdca',
      required: false,
    },
  ],
  taskBlueprints: [
    {
      key: 'planning',
      title: 'Plan and scope work',
      roleKey: 'pm',
      productHint: 'work',
      strategyHint: 'pdca',
      acceptanceCriteria:
        'Produce a breakdown of implementation tasks with clear acceptance criteria and dependency ordering.',
      dependsOnKeys: [],
      summary: 'Analyse the brief, define scope, break down into implementation tasks.',
    },
    {
      key: 'implementation',
      title: 'Implement changes',
      roleKey: 'implementer',
      productHint: 'code',
      strategyHint: 'reflexion',
      acceptanceCriteria:
        'All planned changes are implemented, build passes, and unit tests cover new code.',
      dependsOnKeys: ['planning'],
      summary: 'Write code, run tests, iterate until acceptance criteria are met.',
    },
    {
      key: 'review',
      title: 'Review implementation',
      roleKey: 'reviewer',
      productHint: 'code',
      strategyHint: 'reflexion',
      acceptanceCriteria:
        'Code review completed with no blocking issues; all review comments resolved.',
      dependsOnKeys: ['implementation'],
      summary: 'Review changes for correctness, style, and architectural alignment.',
    },
    {
      key: 'validation',
      title: 'Validate deliverables',
      roleKey: 'qa',
      productHint: 'work',
      strategyHint: 'pdca',
      acceptanceCriteria:
        'All acceptance criteria verified; integration and regression tests pass.',
      dependsOnKeys: ['review'],
      summary: 'Run integration tests, verify acceptance criteria, report results.',
    },
    {
      key: 'delivery',
      title: 'Deliver and close',
      roleKey: 'boss',
      productHint: 'work',
      strategyHint: 'pdca',
      acceptanceCriteria:
        'Artifacts published, stakeholders notified, work item closed.',
      dependsOnKeys: ['validation'],
      summary: 'Publish artifacts, update status, close the work item.',
    },
  ],
  approval: {
    requiresPlanApproval: true,
    requiresDeliveryApproval: true,
  },
};
