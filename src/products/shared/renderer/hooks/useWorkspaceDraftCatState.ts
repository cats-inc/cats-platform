import { useCallback, useState } from 'react';

import type { ExecutionTargetValue } from '../components/ExecutionTarget.js';

export function useWorkspaceDraftCatState() {
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftHighlightedCatId, setDraftHighlightedCatId] = useState<string | null>(null);
  const [draftCatModelOverrides, setDraftCatModelOverrides] = useState<
    Map<string, ExecutionTargetValue>
  >(new Map());

  const onToggleDraftCat = useCallback((catId: string) => {
    setDraftCatIds((prev) => {
      const isRemoving = prev.includes(catId);
      const next = isRemoving
        ? prev.filter((id) => id !== catId)
        : [...prev, catId];
      if (isRemoving) {
        setDraftHighlightedCatId((current) =>
          current === catId ? (next.length > 0 ? next[0] : null) : current,
        );
        setDraftCatModelOverrides((overrides) => {
          const copy = new Map(overrides);
          copy.delete(catId);
          return copy;
        });
      } else {
        setDraftHighlightedCatId(catId);
      }
      return next;
    });
  }, []);

  const onDraftCatModelOverride = useCallback(
    (catId: string, value: ExecutionTargetValue) => {
      setDraftCatModelOverrides((prev) => {
        const copy = new Map(prev);
        copy.set(catId, value);
        return copy;
      });
    },
    [],
  );

  const resetDraftCats = useCallback(() => {
    setDraftCatIds([]);
    setDraftHighlightedCatId(null);
    setDraftCatModelOverrides(new Map());
  }, []);

  return {
    draftCatIds,
    setDraftCatIds,
    draftHighlightedCatId,
    setDraftHighlightedCatId,
    draftCatModelOverrides,
    setDraftCatModelOverrides,
    onToggleDraftCat,
    onDraftCatModelOverride,
    resetDraftCats,
  };
}

