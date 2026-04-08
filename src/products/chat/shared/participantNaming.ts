import { getProviderDisplayName } from '../../../shared/providerCatalog.js';

function normalizeTakenNames(names: ReadonlyArray<string>): Set<string> {
  return new Set(
    names
      .map((name) => name.trim().toLocaleLowerCase())
      .filter((name) => name.length > 0),
  );
}

export function buildAutoTemporaryParticipantName(
  provider: string | null | undefined,
  takenNames: ReadonlyArray<string> = [],
): string {
  const normalizedProvider = provider?.trim();
  const baseName = normalizedProvider
    ? getProviderDisplayName(normalizedProvider)
    : 'Participant';
  const occupiedNames = normalizeTakenNames(takenNames);

  if (!occupiedNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (occupiedNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
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
