# Cat profile publishing: implementation baseline and external links

Date: 2026-11-11. Source inspection and primary-document research only; no media provider,
Desktop UI, tunnel or Telegram acceptance was run for this planning slice.

Informs [ADR-151](../decisions/151-build-cat-profile-posts-on-managed-media-and-share-links.md),
[SPEC-143](../specs/SPEC-143-cat-profile-posts-media-and-sharing.md) and
[PLAN-136](../plans/PLAN-136-cat-profile-posts-media-and-sharing.md).

## Local evidence

Platform baseline: `7b41c51a8` (main at worktree creation).
Runtime inspected: `3232270e81831d64d35ccd678cc6d54f2c88b2e1`.
These are research baselines, not release selections or proof of the installed binary's behavior.

| Finding | Source at baseline | Implication |
| --- | --- | --- |
| Directory owns Cat management and profile routes | [ADR-150](../decisions/150-manage-cats-in-cats-directory-and-keep-settings-app-level.md); `src/app/renderer/entities/companion/CompanionWorkspace.tsx` | Implement the actual Directory surface; do not revive Settings > My Cats |
| Post renderer has text/title/tags and empty `span` media tiles | `src/app/renderer/entities/companion/CompanionFeed.tsx` | Media layout exists in name but not as real image/video rendering |
| Domain tools list/read sources and create text posts | `src/products/chat/companion/supervisedContentTools.ts` | Extend one domain service for lifecycle and attachments |
| Post decision sidecar binds Cat identity and forwards body/title/tags | `src/products/chat/state/runtime-dispatch/companionPostSidecar.ts` | Not an interactive generate → read result → publish loop |
| Owner delete marks `profilePostStatus=removed` | `src/products/chat/api/companionBoxRoutes.ts` | Retain tombstones and route behavior; add agent deletion |
| Derived records own post projections; sources are not auto-published | `src/products/chat/companion/profileReadModel.ts` | Preserve authorship and separate source lineage from attachments |
| Companion snapshot is version 1 | `src/core/companionContracts.ts`; `src/products/chat/state/companion-box/snapshot.ts` | New persistent intent/asset collections need a tested upgrade |
| Source ingestion storage also includes JSON metadata, not a general binary media asset store | `src/products/chat/state/companion-box/fileStore.ts` | A source record alone is not proof of playable image/video bytes |
| Cover uses `cats:draft-header:cover:{catId}` localStorage | `src/products/shared/renderer/catCoverStorage.ts`; `components/DraftHeader.tsx` | Host/background jobs need persisted cover assets and an import path |
| Album uses `life.photoFolder`; photo directive resolves contained realpaths | `src/products/chat/companion/life/photos.ts`; `src/core/companionContracts.ts` | Reuse selected root; video generation needs more than the existing photo sender |
| Cat media MCP currently exposes `image_generate` and `image_status` | `src/platform/multimedia/catImageTools.ts` | Avoid injecting a second session server also named `cats` |
| Platform image requests require `image.generate`, `sourceIds: []` and empty options | `src/runtime/images.ts`; `src/platform/multimedia/imageExecution.ts` | Avatar/image-conditioned generation is a missing execution contract |
| Runtime validator rejects nonempty source IDs and non-image.generate operations | `cats-runtime/src/core/media/contracts.ts`, `src/http/routes/images.ts`, `src/catalogs/media-profiles.json` | Listed chat/image providers do not establish reference-image or video support |
| Own initiative has companion/assist modes and durable unanswered-message back-off | [SPEC-137](../specs/SPEC-137-companion-own-initiative-modes-and-back-off.md); `src/products/chat/companion/life/` | Feed-only activity must not bypass the back-off |
| A dedicated shared ingress already owns remote routing | `src/platform/apps/ingressBoundary.ts`; [SPEC-130](../specs/SPEC-130-desktop-managed-remote-access.md) | Add narrow share routes there, not a tunnel to the ordinary Platform listener |
| Managed ngrok/external mode has scoped implementation; managed Funnel remains open | [PLAN-122](../plans/PLAN-122-desktop-identity-and-remote-access-rollout.md) | Existing-tunnel Tailscale is a valid PoC slice; no claim that managed Funnel is delivered |
| Telegram owner destination is an existing contract | [SPEC-140](../specs/SPEC-140-telegram-owner-pin.md) | Notification reuses that binding instead of model-selected recipients |

Existing SPEC-085 and PLAN-077 contain earlier owner-promotion/agent-only stages. For new work,
use their latest amendments and the source baseline above, not old unchecked implementation rows.
This new proposal does not relabel any historical live acceptance as having passed.

## External facts checked

- Tailscale Serve routes a local service to devices in the tailnet; Funnel serves a local service
  to the broader internet, including people without Tailscale. Use distinct reachability labels
  and tests. [Serve documentation](https://tailscale.com/docs/features/tailscale-serve),
  [Funnel documentation](https://tailscale.com/docs/features/tailscale-funnel).
- ngrok agent endpoints forward incoming HTTP/S traffic to a selected upstream URL or port.
  Our upstream should be the existing dedicated shared ingress; that selection is a Cats design
  decision, not an ngrok requirement. [ngrok HTTP/S endpoints](https://ngrok.com/docs/gateway/endpoints/http).
- Telegram exposes link preview options including disabling previews, selecting a URL and media
  size preferences; some preferences may be ignored. The documentation is not a guarantee that
  every URL will get a preview. [Telegram LinkPreviewOptions](https://core.telegram.org/bots/api#linkpreviewoptions).

Design inference: a tailnet-only Serve page cannot be assumed reachable by Telegram's external
preview fetcher. The message should still contain a usable link for the owner's tailnet device;
preview generation is optional. Public ngrok/Funnel pages need actual external-device acceptance.

## Not yet established

- Which installed provider/profile reliably accepts the Cat's avatar as input and preserves its
  appearance; source inspection of text-to-image cannot answer this.
- Which Runtime adapter will produce a new playable short video with input images/frames.
- Actual quality, latency, resource handoff, external page reachability and Telegram delivery
  for this feature. PLAN-136 records these as implementation acceptance, not planning results.

*Last updated: 2026-11-11*
