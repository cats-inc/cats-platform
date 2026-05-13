export const CHAT_MCP_PROFILE_ID = 'chat-memory' as const;
export const WORK_MCP_PROFILE_ID = 'work-memory' as const;

export const CAT_MCP_PROFILE_IDS = [
  CHAT_MCP_PROFILE_ID,
  WORK_MCP_PROFILE_ID,
] as const;

export type CatMcpProfileId = typeof CAT_MCP_PROFILE_IDS[number];

export function isCatMcpProfileId(value: string): value is CatMcpProfileId {
  return (CAT_MCP_PROFILE_IDS as readonly string[]).includes(value);
}

export function normalizeCatMcpProfile(
  profile: string | null | undefined,
): CatMcpProfileId | null {
  const normalized = profile?.trim();
  if (!normalized) {
    return null;
  }
  if (!isCatMcpProfileId(normalized)) {
    throw new Error(`Unsupported Cat MCP profile: ${normalized}`);
  }
  return normalized;
}
