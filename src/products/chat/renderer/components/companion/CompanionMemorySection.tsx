import { useState, type FormEvent } from 'react';

import type {
  CompanionMemoryCategory,
  CompanionMemoryRecord,
  CreateCompanionMemoryInput,
} from '../../../companion/contracts.js';

export interface CompanionMemorySectionProps {
  memory: CompanionMemoryRecord[];
  loading: boolean;
  onAddMemory: (input: CreateCompanionMemoryInput) => Promise<void>;
  onDeleteMemory: (memoryId: string) => Promise<void>;
}

const MEMORY_CATEGORIES: readonly CompanionMemoryCategory[] = [
  'identity',
  'preference',
  'relationship',
  'fact',
  'event',
  'owner_note',
];

function categoryLabel(category: string): string {
  switch (category) {
    case 'identity': return 'Identity';
    case 'preference': return 'Preference';
    case 'relationship': return 'Relationship';
    case 'fact': return 'Fact';
    case 'event': return 'Event';
    case 'owner_note': return 'Owner Note';
    default: return category;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function CompanionMemorySection({
  memory,
  loading,
  onAddMemory,
  onDeleteMemory,
}: CompanionMemorySectionProps) {
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formCategory, setFormCategory] = useState<CompanionMemoryCategory>('fact');
  const [formContent, setFormContent] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  const filteredMemory = filterCategory
    ? memory.filter((record) => record.category === filterCategory)
    : memory;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!formContent.trim()) return;
    setFormBusy(true);
    try {
      await onAddMemory({
        category: formCategory,
        content: formContent.trim(),
        summary: null,
        sourceIds: [],
        metadata: {},
      });
      setFormContent('');
      setShowForm(false);
    } finally {
      setFormBusy(false);
    }
  }

  if (loading && memory.length === 0) {
    return <div className="companionSection companionLoading">Loading...</div>;
  }

  return (
    <div className="companionSection companionMemory">
      <div className="companionSectionHeader">
        <span>Memory</span>
        <button
          type="button"
          className="companionActionButton"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <form className="companionCard companionForm" onSubmit={handleSubmit}>
          <select
            className="companionSelect"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value as CompanionMemoryCategory)}
          >
            {MEMORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{categoryLabel(cat)}</option>
            ))}
          </select>
          <textarea
            className="companionTextarea"
            placeholder="What should your companion remember?"
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            rows={3}
          />
          <button
            type="submit"
            className="companionActionButton"
            disabled={formBusy || !formContent.trim()}
          >
            {formBusy ? 'Adding...' : 'Add Memory'}
          </button>
        </form>
      )}

      <div className="companionFilterBar">
        <button
          type="button"
          className={`companionFilterPill ${!filterCategory ? 'isActive' : ''}`}
          onClick={() => setFilterCategory(null)}
        >
          All ({memory.length})
        </button>
        {MEMORY_CATEGORIES.map((cat) => {
          const count = memory.filter((r) => r.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              className={`companionFilterPill ${filterCategory === cat ? 'isActive' : ''}`}
              onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
            >
              {categoryLabel(cat)} ({count})
            </button>
          );
        })}
      </div>

      {filteredMemory.length === 0 ? (
        <p className="companionEmpty">
          {memory.length === 0
            ? 'No memories yet. Your companion learns from conversations and resources.'
            : 'No memories match the selected filter.'}
        </p>
      ) : (
        <ul className="companionMemoryList companionMemoryListFull">
          {filteredMemory.map((record) => (
            <li key={record.id} className="companionCard companionMemoryCard">
              <div className="companionMemoryCardHeader">
                <span className="companionMemoryCategory">{categoryLabel(record.category)}</span>
                <span className="companionMemoryDate">{formatDate(record.updatedAt)}</span>
              </div>
              <p className="companionMemoryContent">{record.content}</p>
              {record.summary && (
                <p className="companionMemorySummary">{record.summary}</p>
              )}
              <button
                type="button"
                className="companionDangerButton"
                onClick={() => onDeleteMemory(record.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
