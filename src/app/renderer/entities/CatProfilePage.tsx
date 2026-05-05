import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { fetchAppShell, updateCatProfile } from '../../../products/shared/renderer/api/index.js';
import { hasCompanionSkill } from '../../../products/chat/renderer/chatUtils.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';
import { CompanionWorkspace } from './companion/CompanionWorkspace.js';
// Pull in the chat companion stylesheet so the header chrome / feed
// tiles / side-panel styling render the same way they did under the
// chat product surface.
import '../../../products/chat/renderer/styles/chat-companion.css';

export function CatProfileNotFound({ catId }: { catId: string }) {
  const { t } = useI18n();

  // No back button here — EntitiesShell's sidebar already carries a
  // `Back to Lobby` primary action, and stacking another inside the
  // canvas was a duplicate affordance.
  return (
    <div className="screen screenCentered entityComingSoonScreen">
      <section className="entityComingSoonPanel">
        <h1>{t(messageKeys.catProfileNotFoundTitle)}</h1>
        <p className="entityComingSoonBody">
          {t(messageKeys.catProfileNotFoundBody, { catId })}
        </p>
      </section>
    </div>
  );
}

/**
 * Platform-level page for `/entities/cats/:catId`. Mounts the (copied)
 * `CompanionWorkspace` under `EntitiesShell`, so the sidebar is the
 * platform-level directory chrome — not chat's.
 *
 * Cats with the `companion` skill render the full workspace
 * (header / Post / Photo / activity feed / side panel). Cats
 * without it use the same shell but with the feed hidden — same
 * header + side panel, no Post / Photo region.
 *
 * Cat-mutating actions (avatar save, wake, sleep) hit the chat
 * product API directly and refresh the local payload; there is no
 * shared chat-product state container at this level.
 */
export function CatProfilePage() {
  const { catId } = useParams<{ catId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<AppShellPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAppShell()
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!payload || !catId) {
    return <div className="catProfilePageBoot" />;
  }

  const cat = payload.chat.cats.find((entry) => entry.id === catId);
  if (!cat) {
    return <CatProfileNotFound catId={catId} />;
  }

  const hideFeed = !hasCompanionSkill(cat);

  const refreshPayload = (): void => {
    void fetchAppShell()
      .then((next) => setPayload(next))
      .catch(() => {});
  };

  const onCatAvatarSave = (savedCatId: string, dataUrl: string): void => {
    void updateCatProfile(savedCatId, { avatarUrl: dataUrl })
      .then(() => refreshPayload())
      .catch(() => {});
  };

  // Wake / Sleep mutations are not yet wired at the platform level —
  // the chat product owns the session-lifecycle pipeline. Stub them
  // out so the buttons stay clickable but no-op until the platform
  // gets its own wake/sleep API surface.
  const onWake = (): void => undefined;
  const onSleep = (): void => undefined;

  // No back-to-chat path here; Entities sidebar already provides
  // navigation back to /lobby via its surface switcher.
  const onBackToChat = (): void => {
    navigate('/entities/cats');
  };

  return (
    <CompanionWorkspace
      payload={payload}
      cat={cat}
      onBackToChat={onBackToChat}
      onWake={onWake}
      onSleep={onSleep}
      onCatAvatarSave={onCatAvatarSave}
      hideFeed={hideFeed}
      hideCompanionToggle
    />
  );
}
