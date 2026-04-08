import type { ChatCat } from '../../api/contracts';
import { catInitials } from '../chatUtils';

export interface ComposerCatStackProps {
  cats: ChatCat[];
  bossCatId: string | null;
  defaultRecipientCatId: string | null;
  onClick?: () => void;
}

export function ComposerCatStack({
  cats,
  bossCatId,
  defaultRecipientCatId,
  onClick,
}: ComposerCatStackProps) {
  if (cats.length === 0) return null;

  const lead = defaultRecipientCatId ? cats.find((c) => c.id === defaultRecipientCatId) : cats[0];
  const others = cats.filter((c) => c.id !== lead?.id);
  const ordered = lead ? [lead, ...others] : cats;

  return (
    <div
      className="composerCatStack"
      style={{ marginRight: 10 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {ordered.map((cat, index) => {
        const isBoss = cat.id === bossCatId;
        const isLead = index === 0;
        return (
          <div
            key={cat.id}
            className={`catAvatar composerStackAvatar${isBoss ? ' catAvatarBoss' : ''}`}
            data-tooltip={cat.name}
            style={{
              ...(cat.avatarUrl
                ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : cat.avatarColor ? { background: cat.avatarColor } : {}),
              zIndex: ordered.length - index,
            }}
          >
            {cat.avatarUrl ? null : catInitials(cat.name)}
            {isLead ? <span className="catAvatarLeadBadge">&#x2605;</span> : null}
          </div>
        );
      })}
    </div>
  );
}
