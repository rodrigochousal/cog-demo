import type { KycProviderRecord } from "@platform/shared-types";
import { openStore, type DocumentStore, type StoreOptions } from "../storage/index.js";

/** Local stand-in for a third-party KYC provider's database. */
export interface KycMockDocument {
  records: KycProviderRecord[];
}

export const emptyKycMock = (): KycMockDocument => ({ records: [] });

/** Persisted to `<data dir>/kyc-mock.json` (or in memory with PLATFORM_STORAGE=memory). */
export function openKycMockStore(options?: StoreOptions): DocumentStore<KycMockDocument> {
  return openStore("kyc-mock", emptyKycMock, options);
}
