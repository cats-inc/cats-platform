export type PreAuthOriginGateRejectionReason =
  | 'origin_required'
  | 'origin_not_allowed'
  | 'fetch_site_not_allowed';

export type PreAuthOriginGateDecision =
  | { allowed: true }
  | { allowed: false; reason: PreAuthOriginGateRejectionReason };

export function evaluatePreAuthOriginGate(input: {
  origin: string | string[] | undefined;
  fetchSite: string | string[] | undefined;
  method: string;
  allowedBrowserOrigins: readonly string[];
}): PreAuthOriginGateDecision {
  const origin = readSingleHeader(input.origin);
  const fetchSite = readSingleHeader(input.fetchSite);
  if (requiresOrigin(input.method) && (!origin || origin.trim().length === 0)) {
    return { allowed: false, reason: 'origin_required' };
  }
  if (origin && !input.allowedBrowserOrigins.includes(normalizeBrowserOrigin(origin))) {
    return { allowed: false, reason: 'origin_not_allowed' };
  }
  if (fetchSite === 'cross-site' || fetchSite === 'none') {
    return { allowed: false, reason: 'fetch_site_not_allowed' };
  }
  if (fetchSite === 'same-site' && (!origin || origin.trim().length === 0)) {
    return { allowed: false, reason: 'origin_required' };
  }
  return { allowed: true };
}

export function normalizeBrowserOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function requiresOrigin(method: string): boolean {
  return method.toUpperCase() !== 'GET';
}

function readSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
