export type ConvergencePolicyKind =
  | 'keep_all'
  | 'pick_one'
  | 'synthesize_one'
  | 'promote_one_continue';

export interface ConvergenceOverlayState {
  adoptedLaneId: string | null;
  synthesizedSummary: string | null;
  promotedLaneId: string | null;
  overlayClass: string | null;
}

export function resolveConvergenceOverlay(
  _convergencePolicy: ConvergencePolicyKind | null | undefined,
  _laneIds: string[],
): ConvergenceOverlayState | null {
  // Stub: convergencePolicy is not in the runtime yet.
  // Return null until TurnRecord exposes this field.
  return null;
}
