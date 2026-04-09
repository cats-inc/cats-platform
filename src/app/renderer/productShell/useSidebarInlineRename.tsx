import {
  useRef,
  useState,
} from 'react';

export interface UseSidebarInlineRenameOptions {
  title: string;
  onRename?: (title: string) => void;
  onBeforeStart?: () => void;
}

export function useSidebarInlineRename({
  title,
  onRename,
  onBeforeStart,
}: UseSidebarInlineRenameOptions) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename(): void {
    if (!onRename) {
      return;
    }
    onBeforeStart?.();
    setRenameValue(title);
    setRenaming(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commitRename(): void {
    if (!onRename) {
      setRenaming(false);
      return;
    }
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    }
  }

  function cancelRename(): void {
    setRenaming(false);
  }

  return {
    renaming,
    renameValue,
    inputRef,
    setRenameValue,
    startRename,
    commitRename,
    cancelRename,
  };
}
