// Work Graph projection types live in `src/products/work/shared/workGraphTypes.ts`
// so the server-side projection builder and the renderer can share one source
// of truth. This file re-exports them so existing topdown imports keep working.
export * from "../../../shared/workGraphTypes.js";
