import type {
  SchemaRef,
  SupervisedToolManifest,
  SupervisedToolSideEffect,
  SupervisionToolScope,
  ToolResult,
} from './contracts.js';

const TOOL_SCOPE_ORDER: Record<SupervisionToolScope, number> = {
  none: 0,
  read_only: 1,
  narrow_write: 2,
  broad_write: 3,
};

export type SchemaRefRole = 'input' | 'output';

export interface SchemaRefValidationInput {
  manifest: SupervisedToolManifest;
  role: SchemaRefRole;
  schemaRef: SchemaRef;
}

export type SchemaRefValidator = (input: SchemaRefValidationInput) => string[];

export interface SupervisedToolRegistryOptions {
  validateSchemaRef?: SchemaRefValidator;
}

export interface ToolSurfaceGrant {
  parentToolScope: SupervisionToolScope;
  policyToolScope: SupervisionToolScope;
}

export interface ToolSurfaceDecision extends ToolSurfaceGrant {
  effectiveToolScope: SupervisionToolScope;
  requiredToolScope: SupervisionToolScope;
  allowed: boolean;
  reason?: string;
}

export interface SupervisedToolRegistry {
  register(manifest: SupervisedToolManifest): void;
  get(name: string): SupervisedToolManifest | undefined;
  list(): SupervisedToolManifest[];
  filter(grant: ToolSurfaceGrant): SupervisedToolManifest[];
  authorize(name: string, grant: ToolSurfaceGrant): ToolResult<SupervisedToolManifest>;
}

export function createSupervisedToolRegistry(
  options: SupervisedToolRegistryOptions = {},
): SupervisedToolRegistry {
  const manifests = new Map<string, SupervisedToolManifest>();
  const validateSchemaRef = options.validateSchemaRef ?? defaultSchemaRefValidator;

  return {
    register(manifest) {
      if (manifests.has(manifest.name)) {
        throw new Error(`Duplicate supervised tool manifest: ${manifest.name}`);
      }
      validateManifest(manifest, validateSchemaRef);
      manifests.set(manifest.name, manifest);
    },
    get(name) {
      return manifests.get(name);
    },
    list() {
      return Array.from(manifests.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    },
    filter(grant) {
      return this.list().filter((manifest) =>
        evaluateToolSurface(manifest, grant).allowed,
      );
    },
    authorize(name, grant) {
      const manifest = manifests.get(name);

      if (manifest === undefined) {
        return {
          status: 'rejected',
          error: {
            code: 'E_TOOL_SCOPE_DENIED',
            message: `Supervised tool is not registered: ${name}`,
          },
        };
      }

      const decision = evaluateToolSurface(manifest, grant);
      if (!decision.allowed) {
        return {
          status: 'rejected',
          error: {
            code: 'E_TOOL_SCOPE_DENIED',
            message: decision.reason ?? `Supervised tool is outside the granted surface: ${name}`,
            details: decision,
          },
        };
      }

      return {
        status: 'applied',
        result: manifest,
      };
    },
  };
}

export function evaluateToolSurface(
  manifest: SupervisedToolManifest,
  grant: ToolSurfaceGrant,
): ToolSurfaceDecision {
  const requiredToolScope = classifySideEffectToolScope(manifest.sideEffect);
  const effectiveToolScope = intersectToolScopes(grant.parentToolScope, grant.policyToolScope);
  const allowed = compareToolScopes(effectiveToolScope, requiredToolScope) >= 0;

  return {
    ...grant,
    effectiveToolScope,
    requiredToolScope,
    allowed,
    reason: allowed
      ? undefined
      : `Tool ${manifest.name} requires ${requiredToolScope}, but effective grant is ` +
        `${effectiveToolScope}.`,
  };
}

export function filterToolSurface(
  manifests: SupervisedToolManifest[],
  grant: ToolSurfaceGrant,
): SupervisedToolManifest[] {
  return manifests
    .filter((manifest) => evaluateToolSurface(manifest, grant).allowed)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function classifySideEffectToolScope(
  sideEffect: SupervisedToolSideEffect,
): SupervisionToolScope {
  switch (sideEffect) {
    case 'none':
      return 'read_only';
    case 'local_state':
      return 'narrow_write';
    case 'external_visible':
    case 'destructive':
    case 'expensive':
      return 'broad_write';
    default: {
      const exhaustive: never = sideEffect;
      return exhaustive;
    }
  }
}

export function intersectToolScopes(
  left: SupervisionToolScope,
  right: SupervisionToolScope,
): SupervisionToolScope {
  return compareToolScopes(left, right) <= 0 ? left : right;
}

export function compareToolScopes(
  left: SupervisionToolScope,
  right: SupervisionToolScope,
): number {
  return TOOL_SCOPE_ORDER[left] - TOOL_SCOPE_ORDER[right];
}

function validateManifest(
  manifest: SupervisedToolManifest,
  validateSchemaRef: SchemaRefValidator,
): void {
  const errors = [
    ...validateSchemaRef({ manifest, role: 'input', schemaRef: manifest.inputSchema }),
    ...validateSchemaRef({ manifest, role: 'output', schemaRef: manifest.outputSchema }),
    ...validatePreflightContract(manifest),
  ];

  if (errors.length > 0) {
    throw new Error(`Invalid supervised tool manifest ${manifest.name}: ${errors.join('; ')}`);
  }
}

function defaultSchemaRefValidator(input: SchemaRefValidationInput): string[] {
  const errors: string[] = [];

  if (input.schemaRef.id.trim() === '') {
    errors.push(`${input.role} schema id is required`);
  }
  if (input.schemaRef.version.trim() === '') {
    errors.push(`${input.role} schema version is required`);
  }
  if (input.schemaRef.format !== 'json_schema') {
    errors.push(`${input.role} schema format must be json_schema`);
  }
  if (input.schemaRef.uri !== undefined && isLocalOnlySchemaUri(input.schemaRef.uri)) {
    errors.push(`${input.role} schema uri must not be a local-only path`);
  }

  return errors;
}

function validatePreflightContract(manifest: SupervisedToolManifest): string[] {
  if (
    manifest.sideEffect !== 'none' &&
    manifest.preflight === 'not_supported' &&
    manifest.failureCodes.length === 0
  ) {
    return ['mutating tools without preflight must declare expected failure codes'];
  }

  return [];
}

function isLocalOnlySchemaUri(uri: string): boolean {
  return uri.startsWith('.') || uri.includes('\\') || /^[A-Za-z]:/.test(uri);
}
