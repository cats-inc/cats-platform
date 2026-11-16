/**
 * Compile-time checks that the mobile provider types stay a subset of the
 * Platform's, so a renamed field surfaces in `npm run typecheck` instead
 * of on a phone. Same pattern as `src/products/chat/api/__mobileAlignment.ts`.
 */

import type {
  MobileModelSelection,
  MobileProviderModelCatalog,
  MobileProviderModelsResponse,
  MobileProviderRegistry,
} from '../mobile/contracts.js';
import type { ProductProviderRegistryReadModel, ProviderModelCatalog } from './providerCatalog.js';
import type { ProviderModelSelection } from './providerSelection.js';

type AssertExtends<T extends Required, Required> = true;

const _checkRegistry: AssertExtends<ProductProviderRegistryReadModel, MobileProviderRegistry> = true;
const _checkModelCatalog: AssertExtends<ProviderModelCatalog, MobileProviderModelCatalog> = true;
const _checkModelsResponse: AssertExtends<{ catalog: ProviderModelCatalog }, MobileProviderModelsResponse> = true;
const _checkSelection: AssertExtends<MobileModelSelection, ProviderModelSelection> = true;

void _checkRegistry;
void _checkModelCatalog;
void _checkModelsResponse;
void _checkSelection;
