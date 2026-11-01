import { PAYMENT_RAILS, REFUND_REASONS, REFUND_STATUSES } from "@platform/shared-types";
import type { CreateRefundInput, Money, RefundRecord, UpdateRefundInput } from "@platform/shared-types";
import { createId } from "../../util.js";
import { indexOrThrow, invalidInput, requireId } from "../errors.js";
import type { DiskConnectorOptions, ILedgerDatabase, InitializableConnector } from "../interfaces.js";
import { JsonCollection } from "../json-collection.js";
import {
  defineSchema,
  isIntegerBetween,
  isIsoDate,
  isNonEmptyString,
  isNullableString,
  isOneOf,
  isShape,
  isString,
} from "../schema.js";
import { seedRefunds } from "./seed.js";

const ENTITY = "Refund";
const isMoney = isShape({
  amountMinor: isIntegerBetween(0, Number.MAX_SAFE_INTEGER),
  currency: isOneOf(["USD", "EUR", "GBP"]),
});

export const refundSchema = defineSchema<RefundRecord>({
  id: isNonEmptyString,
  transactionId: isNonEmptyString,
  customerId: isNonEmptyString,
  customerName: isNonEmptyString,
  customerEmail: isNonEmptyString,
  merchantName: isNonEmptyString,
  merchantCategoryCode: (v) => typeof v === "string" && /^\d{4}$/.test(v),
  amount: isMoney,
  originalAmount: isMoney,
  reason: isOneOf(REFUND_REASONS),
  status: isOneOf(REFUND_STATUSES),
  paymentRail: isOneOf(PAYMENT_RAILS),
  destinationLast4: (v) => typeof v === "string" && /^\d{4}$/.test(v),
  riskScore: isIntegerBetween(0, 100),
  requestedBy: isNonEmptyString,
  reviewedBy: isNullableString,
  notes: isString,
  createdAt: isIsoDate,
  updatedAt: isIsoDate,
});

/** Ledger-level constraints (the CHECK constraints a real database would enforce). */
function assertValidRefund(record: RefundRecord): RefundRecord {
  const problems = refundSchema.problems(record);
  if (problems.length > 0) throw invalidInput(`${ENTITY} has invalid fields: ${problems.join(", ")}`, { fields: problems });
  const { amount, originalAmount }: { amount: Money; originalAmount: Money } = record;
  if (amount.currency !== originalAmount.currency) {
    throw invalidInput(`${ENTITY} currency ${amount.currency} does not match the original charge (${originalAmount.currency})`);
  }
  if (amount.amountMinor <= 0) throw invalidInput(`${ENTITY} amount must be greater than zero`);
  if (amount.amountMinor > originalAmount.amountMinor) {
    throw invalidInput(`${ENTITY} amount ${amount.amountMinor} exceeds the original charge of ${originalAmount.amountMinor}`);
  }
  return record;
}

/** ILedgerDatabase over `<data dir>/ledger.json`. Stands in for the finance PostgreSQL cluster. */
export class DiskLedgerDatabase implements ILedgerDatabase, InitializableConnector {
  readonly #collection: JsonCollection<RefundRecord>;
  readonly #now: () => Date;

  constructor({ filePath, mode, latency, now = () => new Date() }: DiskConnectorOptions) {
    this.#now = now;
    this.#collection = new JsonCollection({ label: "ledger", filePath, mode, latency, schema: refundSchema, seed: seedRefunds });
  }

  async initialize(): Promise<void> {
    return this.#collection.initialize();
  }

  async findById(id: string): Promise<RefundRecord> {
    requireId(ENTITY, id);
    const records = await this.#collection.readAll();
    const index = indexOrThrow(records, ENTITY, id, (r) => r.id);
    return records[index] as RefundRecord;
  }

  async findAll(): Promise<RefundRecord[]> {
    return this.#collection.readAll();
  }

  async createRecord(data: CreateRefundInput): Promise<RefundRecord> {
    const timestamp = this.#now().toISOString();
    const record = assertValidRefund(
      refundSchema.pick({ ...data, id: createId("rf"), createdAt: timestamp, updatedAt: timestamp }),
    );
    return this.#collection.mutate((records) => {
      records.push(record);
      return structuredClone(record);
    });
  }

  async updateRecord(id: string, data: UpdateRefundInput): Promise<RefundRecord> {
    requireId(ENTITY, id);
    return this.#collection.mutate((records) => {
      const index = indexOrThrow(records, ENTITY, id, (r) => r.id);
      const current = records[index] as RefundRecord;
      const next = assertValidRefund(
        refundSchema.pick({ ...current, ...data, id: current.id, createdAt: current.createdAt, updatedAt: this.#now().toISOString() }),
      );
      records[index] = next;
      return structuredClone(next);
    });
  }
}
