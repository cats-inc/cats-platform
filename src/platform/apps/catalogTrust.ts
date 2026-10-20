// Official App catalog endpoint and trust root (SPEC-120 FR-09). Both ship inside the
// Desktop: moving the catalog to another host or rotating to a key that this list does
// not already trust requires a Desktop release. The private half is the cats-apps
// CATALOG_SIGNING_KEY Actions secret; cats-apps catalog/signing-keys.json lists the same key.
export const APP_CATALOG_URL = 'https://cats-inc.github.io/cats-apps/catalog/v1/catalog.json';

export interface AppCatalogTrustedKey {
  keyId: string;
  algorithm: 'ed25519';
  /** Raw Ed25519 public key as the base64url JWK `x` value. */
  publicKey: string;
}

export const APP_CATALOG_TRUSTED_KEYS: readonly AppCatalogTrustedKey[] = Object.freeze([
  { keyId: 'cats-apps-catalog-2026-10', algorithm: 'ed25519', publicKey: 'R8YfBK7QRnCus2VloaqbFfTfRn7AGxelCbn-wwHGFpY' },
]);
