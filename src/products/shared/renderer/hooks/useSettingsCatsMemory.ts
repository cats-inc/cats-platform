import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  clearBusyState,
  createMemoryBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import {
  createCatMemory,
  deleteCatMemory,
  listCatMemory,
  type DurableMemoryItem,
} from '../api/index.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

export interface SettingsCatsMemoryController {
  memoryForm: {
    category: string;
    content: string;
  };
  setMemoryForm: Dispatch<SetStateAction<{
    category: string;
    content: string;
  }>>;
  catMemory: DurableMemoryItem[];
  memoryLoading: boolean;
  addMemory: (catId: string) => Promise<void>;
  deleteMemory: (catId: string, memoryId: string) => Promise<void>;
}

export function useSettingsCatsMemory(input: {
  expandedCatId: string | null;
  onBusy: (busy: WorkspaceBusyState) => void;
  onFeedback: (message: string) => void;
}): SettingsCatsMemoryController {
  const { t } = useI18n();
  const [memoryForm, setMemoryForm] = useState({ category: 'fact', content: '' });
  const [catMemory, setCatMemory] = useState<DurableMemoryItem[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);

  useEffect(() => {
    if (!input.expandedCatId) {
      setCatMemory([]);
      setMemoryLoading(false);
      return;
    }

    let cancelled = false;
    setMemoryLoading(true);
    listCatMemory(input.expandedCatId)
      .then((items) => {
        if (!cancelled) {
          setCatMemory(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatMemory([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMemoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [input.expandedCatId]);

  async function addMemory(catId: string): Promise<void> {
    if (!memoryForm.content.trim()) {
      return;
    }

    input.onBusy(createMemoryBusyState('create'));
    try {
      const item = await createCatMemory(catId, {
        category: memoryForm.category,
        content: memoryForm.content.trim(),
      });
      setCatMemory((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)]);
      setMemoryForm({ category: 'fact', content: '' });
    } catch (error) {
      input.onFeedback(error instanceof Error ? error.message : t(messageKeys.sharedSettingsCatsMemorySaveError));
    } finally {
      input.onBusy(clearBusyState());
    }
  }

  async function deleteMemory(catId: string, memoryId: string): Promise<void> {
    input.onBusy(createMemoryBusyState('delete', memoryId));
    try {
      await deleteCatMemory(catId, memoryId);
      setCatMemory((prev) => prev.filter((memoryRecord) => memoryRecord.id !== memoryId));
    } catch (error) {
      input.onFeedback(error instanceof Error ? error.message : t(messageKeys.sharedSettingsCatsMemoryDeleteError));
    } finally {
      input.onBusy(clearBusyState());
    }
  }

  return {
    memoryForm,
    setMemoryForm,
    catMemory,
    memoryLoading,
    addMemory,
    deleteMemory,
  };
}
