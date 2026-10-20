export interface CodeInspectionPreference { open: boolean; section: string | null }
const PREFIX = 'cats:code:inspection:v1:';
const DEFAULT: CodeInspectionPreference = { open: false, section: 'cwd' };

function read(storage: Storage | null, scopeId: string): Record<string, CodeInspectionPreference> {
  try {
    const text = storage?.getItem(PREFIX + scopeId);
    if (!text || new TextEncoder().encode(text).byteLength > 16 * 1024) return {};
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, entry]) => id.length <= 256
      && entry && typeof entry === 'object' && typeof entry.open === 'boolean'
      && (entry.section === null || ['cwd', 'operator', 'work-areas'].includes(entry.section))).slice(-64));
  } catch { return {}; }
}

export function loadCodeInspectionPreference(storage: Storage | null, scopeId: string, channelId: string): CodeInspectionPreference {
  const entries = read(storage, scopeId);
  return Object.hasOwn(entries, channelId) ? entries[channelId]! : DEFAULT;
}

export function saveCodeInspectionPreference(storage: Storage | null, scopeId: string, channelId: string,
  preference: CodeInspectionPreference): void {
  try {
    if (channelId.length > 256) return;
    const entries = [...Object.entries(read(storage, scopeId)).filter(([id]) => id !== channelId),
      [channelId, preference] as const].slice(-64);
    let serialized = JSON.stringify(Object.fromEntries(entries));
    while (new TextEncoder().encode(serialized).byteLength > 16 * 1024 && entries.length) {
      entries.shift(); serialized = JSON.stringify(Object.fromEntries(entries));
    }
    storage?.setItem(PREFIX + scopeId, serialized);
  } catch { /* Storage availability never controls inspection or execution. */ }
}
