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
  const rendered = [...ordered].reverse();

  return (
    <div
      className="composerCatStack"
      style={{ marginRight: 10 }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {rendered.map((cat, index) => {
        const isBoss = cat.id === bossCatId;
        return (
          <div
            key={cat.id}
            className={`catAvatar composerStackAvatar${isBoss ? ' catAvatarBoss' : ''}`}
            data-tooltip={cat.name}
            style={{
              ...(cat.avatarUrl
                ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : {}),
              zIndex: index + 1,
            }}
          >
            {cat.avatarUrl ? null : catInitials(cat.name)}
          </div>
        );
      })}
    </div>
  );
}
