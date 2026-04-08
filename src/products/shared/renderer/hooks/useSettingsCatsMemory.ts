import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import {
  createCatMemory,
  deleteCatMemory,
  listCatMemory,
  type DurableMemoryItem,
} from '../api/index.js';

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
  onBusy: (key: string) => void;
  onFeedback: (message: string) => void;
}): SettingsCatsMemoryController {
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

    input.onBusy('memory:create');
    try {
      const item = await createCatMemory(catId, {
        category: memoryForm.category,
        content: memoryForm.content.trim(),
      });
      setCatMemory((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)]);
      setMemoryForm({ category: 'fact', content: '' });
    } catch (error) {
      input.onFeedback(error instanceof Error ? error.message : 'Failed to save memory.');
    } finally {
      input.onBusy('');
    }
  }

  async function deleteMemory(catId: string, memoryId: string): Promise<void> {
    input.onBusy(`memory:delete:${memoryId}`);
    try {
      await deleteCatMemory(catId, memoryId);
      setCatMemory((prev) => prev.filter((memoryRecord) => memoryRecord.id !== memoryId));
    } catch (error) {
      input.onFeedback(error instanceof Error ? error.message : 'Failed to delete memory.');
    } finally {
      input.onBusy('');
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
