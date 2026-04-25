export const SUPERVISION_REJECTION_CODES = [
  'E_AUDIENCE_LIMIT_EXCEEDED',
  'E_NOT_AUTHORIZED',
  'E_BUDGET_EXCEEDED',
  'E_APPROVAL_REQUIRED',
  'E_APPROVAL_DENIED',
  'E_RUN_CANCELLED',
  'E_PRECHECK_FAILED',
  'E_TOOL_SCOPE_DENIED',
  'E_SCHEMA_INVALID',
] as const;

export type SupervisionRejectionCode = (typeof SUPERVISION_REJECTION_CODES)[number];

export interface SupervisionRejectionError {
  code: SupervisionRejectionCode;
  message: string;
  details?: unknown;
}
