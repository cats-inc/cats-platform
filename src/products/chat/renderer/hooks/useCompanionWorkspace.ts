import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CompanionBoxSummary,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSourceRecord,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
  UpdateCompanionSourceInput,
} from '../../companion/contracts.js';
import type { CompanionWorkspaceTab } from '../companionViewTypes.js';
import {
  createCompanionMemory,
  createCompanionSource,
  deleteCompanionMemory,
  deleteCompanionSource,
  getCompanionBoxSummary,
  getCompanionResponseProfile,
  listCompanionMemory,
  listCompanionSources,
  updateCompanionResponseProfile,
  updateCompanionSource,
} from '../api/companion.js';

export interface CompanionWorkspaceData {
  summary: CompanionBoxSummary | null;
  sources: CompanionSourceRecord[];
  memory: CompanionMemoryRecord[];
  responseProfile: CompanionResponseProfile | null;
  loading: boolean;
  error: string | null;
}

export interface CompanionWorkspaceActions {
  refreshTab: () => void;
  addSource: (input: CreateCompanionSourceInput) => Promise<void>;
  editSource: (sourceId: string, input: UpdateCompanionSourceInput) => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  addMemory: (input: CreateCompanionMemoryInput) => Promise<void>;
  removeMemory: (memoryId: string) => Promise<void>;
  editResponseProfile: (input: UpdateCompanionResponseProfileInput) => Promise<void>;
}

export function useCompanionWorkspace(
  catId: string,
  activeTab: CompanionWorkspaceTab,
): CompanionWorkspaceData & CompanionWorkspaceActions {
  const [summary, setSummary] = useState<CompanionBoxSummary | null>(null);
  const [sources, setSources] = useState<CompanionSourceRecord[]>([]);
  const [memory, setMemory] = useState<CompanionMemoryRecord[]>([]);
  const [responseProfile, setResponseProfile] = useState<CompanionResponseProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounterRef = useRef(0);

  const loadTabData = useCallback(async (tab: CompanionWorkspaceTab) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError(null);

    try {
      switch (tab) {
        case 'overview': {
          const [boxSummary, memoryList] = await Promise.all([
            getCompanionBoxSummary(catId, signal),
            listCompanionMemory(catId, signal),
          ]);
          if (!signal.aborted) {
            setSummary(boxSummary);
            setMemory(memoryList);
          }
          break;
        }
        case 'resources': {
          const sourceList = await listCompanionSources(catId, signal);
          if (!signal.aborted) {
            setSources(sourceList);
          }
          break;
        }
        case 'memory': {
          const memoryList = await listCompanionMemory(catId, signal);
          if (!signal.aborted) {
            setMemory(memoryList);
          }
          break;
        }
        case 'settings': {
          const profile = await getCompanionResponseProfile(catId, signal);
          if (!signal.aborted) {
            setResponseProfile(profile);
          }
          break;
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to load companion data');
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [catId]);

  useEffect(() => {
    loadTabData(activeTab);
    return () => {
      abortRef.current?.abort();
    };
  }, [activeTab, catId, loadTabData]);

  const refreshTab = useCallback(() => {
    refreshCounterRef.current += 1;
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const addSource = useCallback(async (input: CreateCompanionSourceInput) => {
    await createCompanionSource(catId, input);
    refreshTab();
  }, [catId, refreshTab]);

  const editSource = useCallback(async (sourceId: string, input: UpdateCompanionSourceInput) => {
    await updateCompanionSource(catId, sourceId, input);
    refreshTab();
  }, [catId, refreshTab]);

  const removeSource = useCallback(async (sourceId: string) => {
    await deleteCompanionSource(catId, sourceId);
    refreshTab();
  }, [catId, refreshTab]);

  const addMemory = useCallback(async (input: CreateCompanionMemoryInput) => {
    await createCompanionMemory(catId, input);
    refreshTab();
  }, [catId, refreshTab]);

  const removeMemory = useCallback(async (memoryId: string) => {
    await deleteCompanionMemory(catId, memoryId);
    refreshTab();
  }, [catId, refreshTab]);

  const editResponseProfile = useCallback(async (input: UpdateCompanionResponseProfileInput) => {
    const updated = await updateCompanionResponseProfile(catId, input);
    setResponseProfile(updated);
  }, [catId]);

  return {
    summary,
    sources,
    memory,
    responseProfile,
    loading,
    error,
    refreshTab,
    addSource,
    editSource,
    removeSource,
    addMemory,
    removeMemory,
    editResponseProfile,
  };
}
