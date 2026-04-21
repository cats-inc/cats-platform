import { useEffect, useRef } from 'react';

import { catInitials } from '../workspaceChatUtils.js';
import { buildExecutionTargetSummary } from './ExecutionTarget.js';

export interface CatInspectTarget {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarUrl?: string | null;
  provider: string;
  instance: string | null;
  model: string | null;
  skillProfile: string | null;
  isBoss: boolean;
}

export interface CatInspectPanelProps {
  cat: CatInspectTarget;
  onClose: () => void;
}

export function CatInspectPanel({ cat, onClose }: CatInspectPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const executionSummary = buildExecutionTargetSummary({
    provider: cat.provider,
    instance: cat.instance,
    model: cat.model,
    modelSelection: null,
  });

  return (
    <div className="catInspectPanel" ref={panelRef}>
      <div className="catInspectPanelHeader">
        <strong>Cat Preset</strong>
        <button
          type="button"
          className="chromeButton"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="catInspectPanelBody">
        <div className="catInspectIdentity">
          <div
            className={cat.isBoss ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
            style={cat.avatarUrl
              ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : cat.avatarColor ? { background: cat.avatarColor } : undefined}
          >
            {cat.avatarUrl ? null : catInitials(cat.name)}
          </div>
          <div>
            <strong>{cat.name}</strong>
            {cat.isBoss ? <span className="catInspectBadge">Boss</span> : null}
          </div>
        </div>

        <div className="catInspectField">
          <span className="catInspectFieldLabel">Provider</span>
          <span>{executionSummary.providerLabel}</span>
        </div>

        {executionSummary.instanceLabel ? (
          <div className="catInspectField">
            <span className="catInspectFieldLabel">Instance</span>
            <span>{executionSummary.instanceLabel}</span>
          </div>
        ) : null}

        <div className="catInspectField">
          <span className="catInspectFieldLabel">Model</span>
          <span>{executionSummary.modelLabel}</span>
        </div>

        {cat.skillProfile ? (
          <div className="catInspectField">
            <span className="catInspectFieldLabel">Skill Profile</span>
            <span>{cat.skillProfile}</span>
          </div>
        ) : null}

        <p className="catInspectNote">
          This is a shared Cat preset. Changes here would affect all threads using this Cat.
        </p>
      </div>
    </div>
  );
}
