/**
 * Compile-time checks that the mobile Directory types stay a subset of the
 * Platform's (SPEC-103). The mobile client cannot import Platform code, so
 * a renamed or retyped field surfaces here, in `npm run typecheck`, instead
 * of on a phone. Same pattern as `src/products/chat/api/__mobileAlignment.ts`.
 */

import type { MobileDirectoryResponse, MobileDirectoryView } from '../../mobile/contracts.js';
import type { PlatformDirectoryView } from '../../shared/platform-contract.js';

type AssertExtends<T extends Required, Required> = true;

const _checkDirectoryView: AssertExtends<PlatformDirectoryView, MobileDirectoryView> = true;
const _checkDirectoryResponse: AssertExtends<{ directory: PlatformDirectoryView }, MobileDirectoryResponse> = true;

void _checkDirectoryView;
void _checkDirectoryResponse;
