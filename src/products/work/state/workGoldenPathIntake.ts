/**
 * Golden-path intake (SPEC-114 FR-7, FR-8, FR-10).
 *
 * `/work <goal>` goes through the existing product-intent capture tool rather
 * than a Telegram-only shortcut, so the golden path inherits its idempotency
 * key and its intake-boundary marker. That marker is what later makes the
 * authorization command provably a *separate* owner event (FR-20, FR-25): the
 * capture records the update ref that produced it, and admission arrives with a
 * different one.
 */

import type { CoreStore } from '../../../core/store.js';
import type { CoreWorkItemRecord } from '../../../core/types.js';
import { createWorkIntakeDelegate } from './workIntakeDelegate.js';

export interface GoldenPathIntakeInput {
  goal: string;
  bindingId: string;
  conversationId: string;
  externalMessageRef: string | null;
  /** Opaque transport update reference; also the intake boundary action id. */
  externalUpdateRef: string;
}

export interface GoldenPathIntakeContext {
  actorRef: string;
}

export type GoldenPathIntakeResult =
  | { status: 'captured'; workItemId: string; workItem: CoreWorkItemRecord; created: boolean }
  | { status: 'rejected'; message: string };

export async function captureGoldenPathWorkItem(
  coreStore: CoreStore,
  input: GoldenPathIntakeInput,
  context: GoldenPathIntakeContext,
  now: () => Date = () => new Date(),
): Promise<GoldenPathIntakeResult> {
  const delegate = createWorkIntakeDelegate({ coreStore, now });
  const captured = await delegate.capture(
    {
      title: input.goal.trim(),
      status: 'planned',
      source: {
        surface: 'telegram',
        conversationId: input.conversationId,
        transportBindingId: input.bindingId,
        sourceMessageId: input.externalMessageRef ?? input.externalUpdateRef,
        sourceText: input.goal.trim(),
      },
    },
    {
      actorRef: context.actorRef,
      // Binding the intake boundary to the originating update is what stops the
      // same owner message from both capturing and authorizing work.
      actionId: input.externalUpdateRef,
    },
  );

  if (captured.status !== 'applied') {
    return {
      status: 'rejected',
      message: captured.status === 'rejected'
        ? captured.error.message
        : 'Work capture did not apply.',
    };
  }

  const core = await coreStore.readCore();
  const workItem = core.workItems.find(
    (candidate) => candidate.id === captured.result.workItemId,
  ) ?? null;
  if (workItem === null) {
    return { status: 'rejected', message: 'Captured Work Item was not found after write.' };
  }

  return {
    status: 'captured',
    workItemId: workItem.id,
    workItem,
    created: captured.result.created,
  };
}
