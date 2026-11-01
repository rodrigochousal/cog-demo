import type { Refund } from "../../domain/index.js";
import type { VendorAdapter } from "../vendor-collection.js";

/** A payment processor's refund API, as seen by the ledger. */
export interface RefundProcessorAdapter<E> extends VendorAdapter<E, Refund> {
  /** A fresh processor-side id for a new refund. */
  newReference(): string;
}
