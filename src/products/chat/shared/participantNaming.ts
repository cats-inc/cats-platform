import { getProviderDisplayName } from '../../../shared/providerCatalog.js';

function normalizeTakenNames(names: ReadonlyArray<string>): Set<string> {
  return new Set(
    names
      .map((name) => name.trim().toLocaleLowerCase())
      .filter((name) => name.length > 0),
  );
}

const BACKEND_SUFFIX: Record<string, string> = {
  cli: '-CLI',
  api: '-API',
  agent: '-Agent',
  local: '-Local',
};

export function buildAutoTemporaryParticipantName(
  provider: string | null | undefined,
  takenNames: ReadonlyArray<string> = [],
  backend?: string | null,
): string {
  const normalizedProvider = provider?.trim();
  const providerLabel = normalizedProvider
    ? getProviderDisplayName(normalizedProvider)
    : 'Participant';
  const backendSuffix = backend ? (BACKEND_SUFFIX[backend] ?? '') : '';
  const baseName = `${providerLabel}${backendSuffix}`;
  const occupiedNames = normalizeTakenNames(takenNames);

  if (!occupiedNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }

  let counter = 2;
  while (occupiedNames.has(`${baseName} ${counter}`.toLocaleLowerCase())) {
    counter += 1;
  }
  return `${baseName} ${counter}`;
}

export function resolveTemporaryParticipantName(
  input: {
    name?: string | null;
    provider?: string | null;
  },
  takenNames: ReadonlyArray<string> = [],
): string {
  const explicitName = input.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  return buildAutoTemporaryParticipantName(input.provider, takenNames);
}
