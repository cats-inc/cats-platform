export type SetupStep = 1 | 2;

const SETUP_STEP_SEQUENCE: SetupStep[] = [1, 2];

export const TOTAL_SETUP_STEPS = SETUP_STEP_SEQUENCE.length;

export function nextSetupStep(step: SetupStep): SetupStep {
  const index = SETUP_STEP_SEQUENCE.indexOf(step);
  return SETUP_STEP_SEQUENCE[index + 1] ?? step;
}

export function previousSetupStep(step: SetupStep): SetupStep {
  const index = SETUP_STEP_SEQUENCE.indexOf(step);
  return SETUP_STEP_SEQUENCE[index - 1] ?? step;
}
