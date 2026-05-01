import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps as SharedNewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  NewChatDraft as SharedNewChatDraft,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { resolveChatNewChatDraftBuilderControls } from '../../../shared/renderer/draftBuilderControls.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';

export interface NewChatDraftProps extends SharedNewChatDraftProps {
  draftSurface: PlatformSurfaceId;
  onDraftSurfaceChange: (surface: PlatformSurfaceId) => void;
}

// Inline starter chips for Work drafts. All five stay on Work — the
// chip strip is intentionally kept inline (not routed through the
// guideCatAssist baseline + payload chain) until Work earns its own
// surface scope. Mirrors the shape Chat uses in
// `products/chat/renderer/components/NewChatDraft.tsx`.
const WORK_STARTER_CHIPS = [
  {
    id: 'work-start-project',
    label: 'Start a project',
    prompt: 'Spin up a new project workspace and outline its milestones.',
  },
  {
    id: 'work-add-task',
    label: 'Add a task',
    prompt: 'Capture a new task with owner, deadline, and priority.',
  },
  {
    id: 'work-plan-sprint',
    label: 'Plan a sprint',
    prompt: 'Plan the next sprint with goals and a delivery cadence.',
  },
  {
    id: 'work-schedule-review',
    label: 'Schedule a review',
    prompt: 'Schedule a project review with the right cats invited.',
  },
  {
    id: 'work-triage-backlog',
    label: 'Triage backlog',
    prompt: 'Walk the backlog with me and triage what to ship next.',
  },
] as const;

function buildWorkStarterChips(props: NewChatDraftProps) {
  return WORK_STARTER_CHIPS.map((chip) => ({
    id: chip.id,
    label: chip.label,
    onClick: () => props.onComposerChange(chip.prompt),
  }));
}

// Surface tag follows the live `draftSurface` so any future
// cross-surface chip (e.g. Work → Code) can swap the Work chip for the
// destination chip on the composer header. Today every Work chip stays
// on Work, so the chip is effectively static — the dynamic wiring is
// here so adding a `cross:<surface>:` chip later is a one-line change.
function buildWorkSurfaceTag(props: NewChatDraftProps) {
  return (
    <ComposerSurfaceChip
      surface={props.draftSurface}
      onDismiss={
        props.draftSurface !== 'work'
          ? () => props.onDraftSurfaceChange('work')
          : undefined
      }
    />
  );
}

/**
 * Generic +New Work (no direct-lane recipient), +Group Work, and
 * +Parallel Work all render through `ChatNewChatDraft` so
 * +collaborate seeds temps in place and +compare appends a shadow
 * row without navigating off the current URL.
 */
function WorkChatDraft(props: NewChatDraftProps) {
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'work',
  );
  const builderControls = resolveChatNewChatDraftBuilderControls({
    advancedDraftControlsEnabled,
    entryPreset: props.entryPreset ?? 'default',
    showStructuredDraftControls: true,
    hasVisibleParallelDraftTargets: (props.parallelTargets?.length ?? 0) > 1,
  });

  return (
    <ChatNewChatDraft
      {...props}
      draftChrome={{
        surfaceTag: buildWorkSurfaceTag(props),
      }}
      builderControls={builderControls}
      starterChips={{
        leading: buildWorkStarterChips(props),
      }}
    />
  );
}

/**
 * Direct-lane drafts keep the workspace draft surface so the
 * profile header / ComposerCatStack stay intact.
 */
function WorkDirectLaneDraft(props: NewChatDraftProps) {
  const sharedGreeting = props.greeting ?? undefined;
  return (
    <SharedNewChatDraft
      {...props}
      greeting={sharedGreeting}
      surfaceTag={buildWorkSurfaceTag(props)}
    />
  );
}

export function NewChatDraft(props: NewChatDraftProps) {
  if (props.draftDefaultRecipientCatId) {
    return <WorkDirectLaneDraft {...props} />;
  }
  return <WorkChatDraft {...props} />;
}
