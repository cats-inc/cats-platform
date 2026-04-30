import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

// === CODE TASK PILLS MOCKUP (SPEC-068 follow-up, 2026-04-22) ===
//
// User-triggered task reminder pills for active Code conversations.
// Local state only, seeded with fixtures — no persistence, no runtime
// wiring. Replace with the real task-reminder slice once the data
// model lands.

interface MockTask {
  id: string;
  label: string;
}

const EDIT_INPUT_MAX_LENGTH = 80;

function createInitialTasks(t: ReturnType<typeof useI18n>['t']): MockTask[] {
  return [
    { id: 'mock-task-1', label: t(messageKeys.codeTaskPillsMockAuthMiddleware) },
    { id: 'mock-task-2', label: t(messageKeys.codeTaskPillsMockKiroSessionDelete) },
    { id: 'mock-task-3', label: t(messageKeys.codeTaskPillsMockArtifactGallery) },
  ];
}

export function CodeTaskPillsBar(): JSX.Element {
  const { t } = useI18n();
  const initialTasks = useMemo(() => createInitialTasks(t), [t]);
  const [tasks, setTasks] = useState<MockTask[]>(() => initialTasks);
  const [focusId, setFocusId] = useState<string | null>(() => initialTasks[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [nextSeq, setNextSeq] = useState<number>(() => initialTasks.length + 1);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  function beginEdit(task: MockTask): void {
    setEditingId(task.id);
    setEditDraft(task.label);
    setFocusId(task.id);
  }

  function commitEdit(): void {
    if (!editingId) return;
    const trimmed = editDraft.trim();
    if (trimmed.length === 0) {
      // Empty commit = treat like cancel so we never show a nameless pill.
      setTasks((prev) => prev.filter((task) => task.label.trim().length > 0));
    } else {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === editingId ? { ...task, label: trimmed } : task,
        ),
      );
    }
    setEditingId(null);
    setEditDraft('');
  }

  function cancelEdit(): void {
    // If the editing pill is still labeless (freshly added via + Task), drop it.
    setTasks((prev) => prev.filter((task) => task.label.trim().length > 0));
    setEditingId(null);
    setEditDraft('');
  }

  function handleFocus(id: string): void {
    if (editingId) return;
    setFocusId(id);
  }

  function handleHide(id: string, event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    if (editingId === id) {
      setEditingId(null);
      setEditDraft('');
    }
    const remaining = tasks.filter((task) => task.id !== id);
    setTasks(remaining);
    if (focusId === id) {
      setFocusId(remaining[0]?.id ?? null);
    }
  }

  function handleAdd(): void {
    const newTask: MockTask = {
      id: `mock-task-${nextSeq}`,
      label: '',
    };
    setTasks((prev) => [...prev, newTask]);
    setFocusId(newTask.id);
    setEditingId(newTask.id);
    setEditDraft('');
    setNextSeq((n) => n + 1);
  }

  function handleEditChange(event: ChangeEvent<HTMLInputElement>): void {
    setEditDraft(event.target.value);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  return (
    <div className="codeTaskPillsBar" aria-label={t(messageKeys.codeTaskPillsAriaLabel)}>
      {tasks.map((task) => {
        const isFocus = task.id === focusId;
        const isEditing = task.id === editingId;
        const className = isFocus
          ? 'codeTaskPill codeTaskPillFocused'
          : 'codeTaskPill';
        return (
          <span key={task.id} className={className}>
            <span className="codeTaskPillDot" aria-hidden="true" />
            {isEditing ? (
              <input
                ref={editInputRef}
                className="codeTaskPillInput"
                type="text"
                value={editDraft}
                maxLength={EDIT_INPUT_MAX_LENGTH}
                placeholder={t(messageKeys.codeTaskPillsNamePlaceholder)}
                onChange={handleEditChange}
                onKeyDown={handleEditKeyDown}
                onBlur={commitEdit}
                aria-label={t(messageKeys.codeTaskPillsEditAria)}
              />
            ) : (
              <button
                type="button"
                className="codeTaskPillLabel"
                onClick={() => handleFocus(task.id)}
                onDoubleClick={() => beginEdit(task)}
                aria-pressed={isFocus}
                title={
                  isFocus
                    ? t(messageKeys.codeTaskPillsTitleCurrent, { taskLabel: task.label })
                    : t(messageKeys.codeTaskPillsTitleFocus, { taskLabel: task.label })
                }
              >
                {task.label}
              </button>
            )}
            <button
              type="button"
              className="codeTaskPillHide"
              aria-label={t(messageKeys.codeTaskPillsHideAria, {
                taskLabel: task.label || t(messageKeys.codeTaskPillsFallbackTask),
              })}
              onClick={(event) => handleHide(task.id, event)}
              disabled={isEditing}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2 2l6 6" />
                <path d="M8 2l-6 6" />
              </svg>
            </button>
          </span>
        );
      })}
      <button
        type="button"
        className="codeAddTaskButton"
        onClick={handleAdd}
        aria-label={t(messageKeys.codeTaskPillsAddAria)}
        disabled={editingId !== null}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 2v8" />
          <path d="M2 6h8" />
        </svg>
        <span>{t(messageKeys.codeTaskPillsButtonTask)}</span>
      </button>
    </div>
  );
}
