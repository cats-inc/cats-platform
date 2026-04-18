import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampFloatingAnchorToSafeArea,
  hasDragMovement,
  isPointerOverSlotCorridor,
  projectFloatingAnchorToNormalized,
  resolveActiveDockSlot,
  resolveEffectiveFloatingAnchor,
  resolveGuideCatProjection,
  resolveGuideCatSafeArea,
  resolveGuideCatSurfaceClass,
  GUIDE_CAT_DRAG_MOVEMENT_THRESHOLD_PX,
  GUIDE_CAT_UNDOCK_ESCAPE_THRESHOLD_PX,
  resolveGuideCatFloatingReleaseCommit,
} from '../src/app/renderer/guideCatPlacement.ts';
import { GUIDE_CAT_FLOATING_ANCHOR_DEFAULT } from '../src/shared/platform-contract.ts';

test('resolveGuideCatSurfaceClass maps lobby/workspace/hidden from the pathname', () => {
  assert.equal(resolveGuideCatSurfaceClass('/lobby'), 'lobby');
  assert.equal(resolveGuideCatSurfaceClass('/lobby/tips'), 'lobby');
  assert.equal(resolveGuideCatSurfaceClass('/chat'), 'workspace');
  assert.equal(resolveGuideCatSurfaceClass('/work/tasks'), 'workspace');
  assert.equal(resolveGuideCatSurfaceClass('/code/draft-1'), 'workspace');
  assert.equal(resolveGuideCatSurfaceClass('/setup'), 'hidden');
  assert.equal(resolveGuideCatSurfaceClass('/settings'), 'hidden');
  assert.equal(resolveGuideCatSurfaceClass('/settings/general'), 'hidden');
});

test('resolveGuideCatSafeArea keeps a pill-radius buffer around chrome edges', () => {
  const viewport = { width: 1200, height: 800 };

  // Pill radius (14px) is added to each edge so the rendered pill edge stays
  // a full 16px margin away from chrome — matching the pre-refactor spacing.
  const lobbySafe = resolveGuideCatSafeArea({
    surface: 'lobby',
    viewport,
    topChromeBottom: 60,
    sidebarRight: null,
  });
  assert.equal(lobbySafe.left, 30);
  assert.equal(lobbySafe.top, 90);

  const workspaceSafe = resolveGuideCatSafeArea({
    surface: 'workspace',
    viewport,
    topChromeBottom: null,
    sidebarRight: 240,
  });
  assert.equal(workspaceSafe.left, 270);
  assert.equal(workspaceSafe.top, 30);
  assert.equal(workspaceSafe.right, 1170);
  assert.equal(workspaceSafe.bottom, 770);
});

test('resolveGuideCatSafeArea trims the workspace right edge around visible blocked regions', () => {
  const viewport = { width: 1200, height: 800 };
  const safeArea = resolveGuideCatSafeArea({
    surface: 'workspace',
    viewport,
    topChromeBottom: null,
    sidebarRight: 240,
    rightBlockedLeft: 840,
  });

  assert.equal(safeArea.left, 270);
  assert.equal(safeArea.right, 810);
});

test('clampFloatingAnchorToSafeArea pins anchors inside the safe rectangle', () => {
  const viewport = { width: 1000, height: 600 };
  const safeArea = { left: 100, top: 40, right: 900, bottom: 560 };

  const insideBefore = clampFloatingAnchorToSafeArea({
    anchor: { x: 0.5, y: 0.5 },
    viewport,
    safeArea,
  });
  assert.deepEqual(insideBefore, { x: 500, y: 300 });

  const tooFarLeft = clampFloatingAnchorToSafeArea({
    anchor: { x: 0.02, y: 0.5 },
    viewport,
    safeArea,
  });
  assert.equal(tooFarLeft.x, 100);

  const tooFarBottom = clampFloatingAnchorToSafeArea({
    anchor: { x: 0.5, y: 0.99 },
    viewport,
    safeArea,
  });
  assert.equal(tooFarBottom.y, 560);
});

test('projectFloatingAnchorToNormalized converts pointer pixels to 0..1 coordinates', () => {
  const viewport = { width: 1000, height: 500 };
  assert.deepEqual(
    projectFloatingAnchorToNormalized({ pointerX: 250, pointerY: 250, viewport }),
    { x: 0.25, y: 0.5 },
  );
  const negative = projectFloatingAnchorToNormalized({
    pointerX: -100,
    pointerY: 0,
    viewport,
  });
  assert.equal(negative.x, 0);
  const overshoot = projectFloatingAnchorToNormalized({
    pointerX: 1200,
    pointerY: 600,
    viewport,
  });
  assert.equal(overshoot.x, 1);
  assert.equal(overshoot.y, 1);
});

test('resolveEffectiveFloatingAnchor falls back to the shared default when null', () => {
  assert.deepEqual(resolveEffectiveFloatingAnchor(null), GUIDE_CAT_FLOATING_ANCHOR_DEFAULT);
  assert.deepEqual(
    resolveEffectiveFloatingAnchor({ x: 0.2, y: 0.8 }),
    { x: 0.2, y: 0.8 },
  );
});

test('resolveGuideCatFloatingReleaseCommit returns one atomic patch for floating release and undock', () => {
  const viewport = { width: 1000, height: 600 };
  const safeArea = { left: 100, top: 40, right: 900, bottom: 560 };

  assert.deepEqual(
    resolveGuideCatFloatingReleaseCommit({
      pointerX: 320,
      pointerY: 260,
      viewport,
      safeArea,
    }),
    {
      floatingAnchor: { x: 0.32, y: 0.43333333333333335 },
    },
  );

  assert.deepEqual(
    resolveGuideCatFloatingReleaseCommit({
      pointerX: 20,
      pointerY: 580,
      viewport,
      safeArea,
      undock: true,
    }),
    {
      placement: 'floating',
      floatingAnchor: { x: 0.1, y: 0.9333333333333333 },
    },
  );
});

test('isPointerOverSlotCorridor uses a 24px padding around the slot rect', () => {
  const slotRect = { left: 200, top: 400, right: 260, bottom: 440 };

  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 230, pointerY: 420, slotRect }),
    true,
  );
  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 180, pointerY: 420, slotRect }),
    true,
  );
  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 176, pointerY: 420, slotRect }),
    true,
  );
  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 175, pointerY: 420, slotRect }),
    false,
  );
  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 150, pointerY: 420, slotRect }),
    false,
  );
  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 500, pointerY: 420, slotRect }),
    false,
  );
  assert.equal(
    isPointerOverSlotCorridor({ pointerX: 230, pointerY: 420, slotRect: null }),
    false,
  );
});

test('resolveActiveDockSlot maps workspace surface to workspace slot and lobby to lobby', () => {
  assert.equal(resolveActiveDockSlot('lobby'), 'lobby');
  assert.equal(resolveActiveDockSlot('workspace'), 'workspace');
  assert.equal(resolveActiveDockSlot('hidden'), null);
});

test('resolveGuideCatProjection yields hidden on hidden surfaces regardless of placement', () => {
  const viewport = { width: 800, height: 600 };
  const safeArea = resolveGuideCatSafeArea({
    surface: 'hidden',
    viewport,
    topChromeBottom: null,
    sidebarRight: null,
  });
  assert.deepEqual(
    resolveGuideCatProjection({
      placement: 'floating',
      anchor: { x: 0.5, y: 0.5 },
      surface: 'hidden',
      viewport,
      safeArea,
    }),
    { kind: 'hidden' },
  );
  assert.deepEqual(
    resolveGuideCatProjection({
      placement: 'docked',
      anchor: null,
      surface: 'hidden',
      viewport,
      safeArea,
    }),
    { kind: 'hidden' },
  );
});

test('resolveGuideCatProjection renders the docked slot matching the active surface', () => {
  const viewport = { width: 1000, height: 700 };
  const safeArea = resolveGuideCatSafeArea({
    surface: 'workspace',
    viewport,
    topChromeBottom: null,
    sidebarRight: 220,
  });
  assert.deepEqual(
    resolveGuideCatProjection({
      placement: 'docked',
      anchor: null,
      surface: 'lobby',
      viewport,
      safeArea,
    }),
    { kind: 'docked', slot: 'lobby' },
  );
  assert.deepEqual(
    resolveGuideCatProjection({
      placement: 'docked',
      anchor: null,
      surface: 'workspace',
      viewport,
      safeArea,
    }),
    { kind: 'docked', slot: 'workspace' },
  );
});

test('resolveGuideCatProjection clamps floating anchors and flags reflow override when clamped', () => {
  const viewport = { width: 1000, height: 600 };
  const safeArea = resolveGuideCatSafeArea({
    surface: 'workspace',
    viewport,
    topChromeBottom: null,
    sidebarRight: 300,
  });

  const unclamped = resolveGuideCatProjection({
    placement: 'floating',
    anchor: { x: 0.5, y: 0.5 },
    surface: 'workspace',
    viewport,
    safeArea,
  });
  assert.equal(unclamped.kind, 'floating');
  if (unclamped.kind === 'floating') {
    assert.equal(unclamped.overrideReason, null);
    assert.equal(unclamped.x, 500);
    assert.equal(unclamped.y, 300);
  }

  const clamped = resolveGuideCatProjection({
    placement: 'floating',
    anchor: { x: 0.02, y: 0.5 },
    surface: 'workspace',
    viewport,
    safeArea,
  });
  assert.equal(clamped.kind, 'floating');
  if (clamped.kind === 'floating') {
    assert.equal(clamped.overrideReason, 'collision_reflow');
    assert.equal(clamped.x, safeArea.left);
  }
});

test('resolveGuideCatProjection falls back to the default anchor when none is persisted', () => {
  const viewport = { width: 1200, height: 800 };
  const safeArea = resolveGuideCatSafeArea({
    surface: 'lobby',
    viewport,
    topChromeBottom: 50,
    sidebarRight: null,
  });
  const projection = resolveGuideCatProjection({
    placement: 'floating',
    anchor: null,
    surface: 'lobby',
    viewport,
    safeArea,
  });
  assert.equal(projection.kind, 'floating');
  if (projection.kind === 'floating') {
    assert.ok(projection.x >= safeArea.left);
    assert.ok(projection.x <= safeArea.right);
    assert.ok(projection.y >= safeArea.top);
    assert.ok(projection.y <= safeArea.bottom);
  }
});

test('undock escape threshold constant is the SPEC-071 24px value', () => {
  assert.equal(GUIDE_CAT_UNDOCK_ESCAPE_THRESHOLD_PX, 24);
});

test('hasDragMovement flips true once the pointer leaves the 4px click window', () => {
  assert.equal(GUIDE_CAT_DRAG_MOVEMENT_THRESHOLD_PX, 4);
  assert.equal(
    hasDragMovement({ startX: 100, startY: 100, currentX: 101, currentY: 101 }),
    false,
  );
  assert.equal(
    hasDragMovement({ startX: 100, startY: 100, currentX: 103, currentY: 102 }),
    false,
  );
  assert.equal(
    hasDragMovement({ startX: 100, startY: 100, currentX: 104, currentY: 100 }),
    true,
  );
  assert.equal(
    hasDragMovement({ startX: 100, startY: 100, currentX: 200, currentY: 300 }),
    true,
  );
});
