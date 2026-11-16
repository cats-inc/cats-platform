import type {
  PlatformLobbyCatterySummary,
  PlatformLobbyClowderSummary,
} from '../../shared/platform-contract.js';
import { directoryStoreFor } from './store.js';
import { buildDirectoryView, buildLobbyDirectorySummaries } from './view.js';

/**
 * The lobby's Clowder and Cattery summaries. An unreadable directory file must
 * not stop the app from loading, so it yields empty lists here; the Directory
 * canvas, which reads the file itself, reports the failure.
 */
export async function readLobbyDirectorySummaries(
  chatStatePath: string,
  catIds: ReadonlySet<string>,
): Promise<{ clowders: PlatformLobbyClowderSummary[]; catteries: PlatformLobbyCatterySummary[] }> {
  try {
    const snapshot = await directoryStoreFor(chatStatePath).read();
    return buildLobbyDirectorySummaries(buildDirectoryView(snapshot, catIds));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[cats-platform-directory] lobby_summaries: ${message}\n`);
    return { clowders: [], catteries: [] };
  }
}
