export interface OwnerRelationshipView {
  family: string; id: string; title: string; token: string; blockers: string[];
  fields: Array<{ field: string; targetFamily: string; current: string | null; choices: Array<{ id: string; title: string }> }>;
}
export interface OrphanLinkPreview {
  token: string;
  items: Array<{ id: string; kind: string; source: string; target: string }>;
}
