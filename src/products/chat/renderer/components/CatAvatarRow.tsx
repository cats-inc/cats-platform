import type { ChatCat } from '../../api/contracts';
import { catInitials } from '../chatUtils';

export interface CatAvatarRowProps {
  cats: ChatCat[];
  bossCatId: string | null;
  selectedIds: string[];
  highlightedId: string | null;
  leadCatId?: string | null;
  toggleable: boolean;
  showLeadBadge?: boolean;
  onToggle: (catId: string) => void;
  onHighlight: (catId: string) => void;
}

export function CatAvatarRow({
  cats,
  bossCatId,
  selectedIds,
  highlightedId,
  leadCatId,
  toggleable,
  showLeadBadge,
  onToggle,
  onHighlight,
}: CatAvatarRowProps) {
  const sorted = [...cats].sort((a, b) => {
    const aRank = a.id === bossCatId ? 0 : 1;
    const bRank = b.id === bossCatId ? 0 : 1;
    return aRank - bRank;
  });

  if (sorted.length === 0) return null;

  const selectedSet = new Set(selectedIds);

  return (
    <div className="catAvatarRow">
      {sorted.map((cat) => {
        const isSelected = selectedSet.has(cat.id);
        const isHighlighted = cat.id === highlightedId;
        const isBoss = cat.id === bossCatId;
        const isLead = cat.id === leadCatId;
        const classNames = [
          'catAvatar',
          'catAvatarRowItem',
          isBoss ? 'catAvatarBoss' : '',
          isSelected ? 'catAvatarRowItemSelected' : '',
          isHighlighted ? 'catAvatarRowItemHighlighted' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={cat.id}
            role="button"
            tabIndex={0}
            className={classNames}
            style={cat.avatarColor ? { background: cat.avatarColor } : undefined}
            data-tooltip={cat.name}
            onClick={() => {
              if (toggleable) {
                onToggle(cat.id);
              }
              if (!toggleable && isSelected) {
                onHighlight(cat.id);
              }
            }}
          >
            {catInitials(cat.name)}
            {showLeadBadge && isLead ? (
              <span className="catAvatarLeadBadge">&#x1F451;</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
