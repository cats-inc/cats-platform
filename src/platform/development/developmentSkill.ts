import path from 'node:path';
import type { RuntimeClient, RuntimeRequestedSkillRef } from '../runtime/client.js';

export const CATS_DEVELOPMENT_SKILL = 'cats-inc-development';
export interface DevelopmentSkillPin extends RuntimeRequestedSkillRef { sourcePath: string; entryFile: string }
const fail = (reason: string): never => { throw new Error(`cats_development_${reason}`); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : fail('delivery_unavailable');
const text = (value: unknown): string => typeof value === 'string' && value.length > 0 && value.length <= 4096
  ? value : fail('delivery_unavailable');
const hash = (value: unknown): string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
  ? value : fail('fingerprint_unavailable');
const only = (value: unknown): Record<string, unknown> => Array.isArray(value) && value.length === 1
  ? object(value[0]) : fail('skill_mismatch');
const ids = (value: unknown) => Array.isArray(value) && value.length === 1 && value[0] === CATS_DEVELOPMENT_SKILL;
const samePath = (a: string, b: string) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

export function readDevelopmentSkillPin(input: unknown): DevelopmentSkillPin {
  const skill = object(input);
  if (skill.id !== CATS_DEVELOPMENT_SKILL || skill.contentProfile !== 'preview' || skill.status !== 'resolved') fail('skill_unavailable');
  const version = text(skill.version ?? object(skill.library).version);
  if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/u.test(version)) fail('skill_unavailable');
  return { id: CATS_DEVELOPMENT_SKILL, version, fingerprint: hash(skill.fingerprint),
    sourcePath: text(skill.sourcePath), entryFile: text(skill.entryFile) };
}

/** Filtered catalog is eligibility only. Actual session delivery remains mandatory. */
export async function preflightDevelopmentSkill(runtime: RuntimeClient): Promise<DevelopmentSkillPin> {
  if (!runtime.getSkillCatalog) return fail('skill_unavailable');
  try { return readDevelopmentSkillPin(only(object(await runtime.getSkillCatalog(CATS_DEVELOPMENT_SKILL)).skills)); }
  catch { return fail('skill_unavailable'); }
}

export function verifyDevelopmentDelivery(input: {
  observation: unknown; pin: DevelopmentSkillPin; sessionId: string; cwd: string;
  provider: string; target: string; tools: string[]; model?: string | null;
}) {
  const session = object(object(input.observation).session), skills = object(session.skills);
  const hydration = object(session.hydration), hydratedSkills = object(hydration.skills);
  const workspace = object(session.workspace), providerTarget = object(session.providerTarget);
  const hydratedWorkspace = object(hydration.workspace);
  if (session.id !== input.sessionId || session.providerName !== input.provider || providerTarget.resolved !== true
    || providerTarget.provider !== input.provider || providerTarget.target !== input.target
    || `${session.providerBackend}/${session.providerInstanceId}` !== input.target
    || (input.model != null && session.model !== input.model)
    || !samePath(text(session.cwd), input.cwd) || workspace.kind !== 'worktree' || workspace.access !== 'read_write'
    || hydratedWorkspace.kind !== 'worktree' || hydratedWorkspace.access !== 'read_write'
    || !samePath(text(hydratedWorkspace.runtimeCwd), input.cwd)
    || session.permissionMode !== 'whitelist'
    || !Array.isArray(session.allowedTools) || JSON.stringify([...session.allowedTools].sort()) !== JSON.stringify([...input.tools].sort())) fail('session_mismatch');
  const policy = object(skills.contentPolicy), provenance = object(object(hydration.metadata).runtimeSkillContent);
  if (policy.profile !== 'preview' || provenance.schemaVersion !== 1 || provenance.sessionId !== input.sessionId
    || provenance.profile !== 'preview' || provenance.releaseCompatible !== false
    || provenance.policyFingerprint !== hash(policy.fingerprint) || skills.strict !== true) fail('policy_mismatch');
  const delivery = object(skills.delivery);
  if (delivery.status !== 'applied' || (delivery.mode !== 'filesystem' && delivery.mode !== 'instructions')
    || delivery.provider !== input.provider || delivery.backend !== session.providerBackend
    || hydratedSkills.status !== 'applied' || hydratedSkills.mode !== delivery.mode
    || hydratedSkills.provider !== input.provider || hydratedSkills.backend !== session.providerBackend) fail('delivery_unavailable');
  for (const state of [skills, hydratedSkills]) {
    if (!ids(state.requestedSkills) || !ids(state.appliedSkillIds)) fail('skill_mismatch');
    if (JSON.stringify(readDevelopmentSkillPin(only(state.resolvedSkills))) !== JSON.stringify(input.pin)) fail('fingerprint_changed');
    const ref = only(state.requestedSkillRefs);
    if (ref.id !== input.pin.id || ref.version !== input.pin.version || ref.fingerprint !== input.pin.fingerprint) fail('fingerprint_changed');
    if (!Array.isArray(state.warnings) || state.warnings.length) fail('delivery_degraded');
  }
  if (!Array.isArray(delivery.warnings) || delivery.warnings.length) fail('delivery_degraded');
  const filesystem = delivery.mode === 'filesystem' ? object(delivery.filesystem) : null;
  if (delivery.mode === 'instructions') {
    const bytes = object(delivery.instructions).byteLength;
    if (!Number.isSafeInteger(bytes) || Number(bytes) <= 0 || Number(bytes) > 256 * 1024) fail('delivery_unavailable');
  }
  const entryPaths = filesystem?.entryPaths;
  if (filesystem && (!Array.isArray(entryPaths) || entryPaths.length < 1 || entryPaths.length > 8
    || entryPaths.some(entry => typeof entry !== 'string' || entry.length > 4096))) fail('resources_unavailable');
  return { profile: 'preview' as const, policyFingerprint: hash(policy.fingerprint), skillsRoot: text(policy.skillsRoot),
    sessionId: input.sessionId, provider: input.provider, target: input.target, cwd: input.cwd,
    model: session.model === null || session.model === undefined ? null : text(session.model),
    skill: { ...input.pin }, mode: text(delivery.mode), warnings: [] as string[],
    resources: filesystem ? { status: 'materialized' as const, rootPath: text(filesystem.rootPath), entryPaths: entryPaths as string[] }
      : { status: 'not_established' as const },
  };
}
export type DevelopmentDeliveryReceipt = ReturnType<typeof verifyDevelopmentDelivery>;
