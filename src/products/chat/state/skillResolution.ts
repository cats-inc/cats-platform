/**
 * Skill profile resolution — maps cat skill profiles to runtime skill names.
 * Product owns the intent (which profiles exist, what they mean).
 * Runtime owns the execution (SKILL.md packages).
 */

/**
 * Resolve a Cat's skill profile to a list of runtime skill names.
 *
 * First-slice mapping:
 * - 'companion' → ['companion']
 * - 'chat-default' → [] (no skills)
 * - null/undefined → [] (no skills)
 */
export function resolveSkillProfile(skillProfile: string | null | undefined): string[] {
  if (!skillProfile) return [];

  switch (skillProfile) {
    case 'companion':
      return ['companion'];
    case 'chat-default':
      return [];
    default:
      // Future profiles can be added here
      return [];
  }
}
