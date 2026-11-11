import { useCallback, useEffect, useState } from 'react';
import { getCompanionMedia, uploadCompanionMedia } from '../../../../../products/chat/renderer/api/companion.js';
import { readCatCover, writeCatCover } from '../../../../../products/shared/renderer/catCoverStorage.js';

export function useCompanionCover(catId: string, onError: () => void) {
  const [cover, setCover] = useState<{ catId: string; url: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      let library = await getCompanionMedia(catId);
      const old = readCatCover(catId);
      if (!library.coverUrl && old?.startsWith('data:image/')) {
        // Preserve a local recovery copy before the managed upload and validated readback.
        window.localStorage.setItem(`cats:cover-migration-backup:${catId}`, old);
        await uploadCompanionMedia(catId, await (await fetch(old)).blob(), 'cover', true);
        library = await getCompanionMedia(catId);
      }
      if (!active) return;
      setCover({ catId, url: library.coverUrl });
      // Keep other header mounts consistent; replace legacy data only after readback succeeds.
      if (library.coverUrl) writeCatCover(catId, library.coverUrl);
    })().catch(() => { /* Keep the legacy cover visible; retry on the next profile visit. */ });
    return () => { active = false; };
  }, [catId]);
  const save = useCallback((dataUrl: string) => {
    void (async () => {
      const result = await uploadCompanionMedia(catId, await (await fetch(dataUrl)).blob(), 'cover');
      setCover({ catId, url: result.url }); writeCatCover(catId, result.url);
    })().catch(onError);
  }, [catId, onError]);
  return { url: cover?.catId === catId ? cover.url : undefined, save };
}
