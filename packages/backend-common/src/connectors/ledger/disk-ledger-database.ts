import { CURRENCY_CODES, PAYMENT_PROCESSORS, PAYMENT_RAILS, REFUND_REASONS, REFUND_STATUSES } from "../../domain/index.js";
import type { CreateRefundInput, Money, PaymentProcessor, Refund, UpdateRefundInput } from "../../domain/index.js";
import { createId } from "../../util.js";
import { indexOrThrow, invalidInput, requireId } from "../errors.js";
import type { DiskConnectorOptions, ILedgerDatabase, InitializableConnector } from "../interfaces.js";
import {
  defineSchema,
  isArrayOf,
  isIntegerBetween,
  isIsoDate,
  isNonEmptyString,
  isNullableString,
  isOneOf,
  isShape,
  isString,
} from "../schema.js";
import { ownerOf, readAllFrom, VendorCollection, type DomainCollection } from "../vendor-collection.js";
import type { RefundProcessorAdapter } from "./processor.js";
import { paypalRefunds } from "./vendors/paypal.js";
import { stripeRefunds } from "./vendors/stripe.js";

const ENTITY = "Refund";
const isMoney = isShape({
  amountMinor: isIntegerBetween(0, Number.MAX_SAFE_INTEGER),
  currency: isOneOf(CURRENCY_CODES),
});

const isHandle = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9._-]+$/.test(v);

export const refundSchema = defineSchema<Refund>({
  id: isNonEmptyString,
  processor: isOneOf(PAYMENT_PROCESSORS),
  processorReference: isNonEmptyString,
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
  approvals: isArrayOf(isHandle),
  notes: isString,
  createdAt: isIsoDate,
  updatedAt: isIsoDate,
});

/** Ledger-level constraints (the CHECK constraints a real database would enforce). */
function assertValidRefund(record: Refund): Refund {
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
  if (new Set(record.approvals).size !== record.approvals.length) throw invalidInput(`${ENTITY} approvals must be distinct`);
  return record;
}

interface ProcessorSlot {
  collection: DomainCollection<Refund>;
  newReference(): string;
}

const byCreation = (a: Refund, b: Refund) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * ILedgerDatabase over one mock API per payment processor (`<data dir>/stripe-refunds.json`,
 * `paypal-refunds.json`). Each processor's adapter maps its own refund shape to the generic
 * `Refund`; nothing outside this connector sees a processor's shape.
 */
export class DiskLedgerDatabase implements ILedgerDatabase, InitializableConnector {
  readonly #processors: Record<PaymentProcessor, ProcessorSlot>;
  readonly #collections: DomainCollection<Refund>[];
  readonly #now: () => Date;

  constructor({ dataDir, mode, latency, now = () => new Date() }: DiskConnectorOptions) {
    this.#now = now;
    const open = <E>(adapter: RefundProcessorAdapter<E>): ProcessorSlot => ({
      collection: new VendorCollection(adapter, { dataDir, mode, latency }, { connector: "ledger", entity: ENTITY, idOf: (r) => r.id }),
      newReference: () => adapter.newReference(),
    });
    this.#processors = { stripe: open(stripeRefunds), paypal: open(paypalRefunds) };
    this.#collections = PAYMENT_PROCESSORS.map((processor) => this.#processors[processor].collection);
  }

  async initialize(): Promise<void> {
    await Promise.all(this.#collections.map((collection) => collection.initialize()));
  }

  async findById(id: string): Promise<Refund> {
    requireId(ENTITY, id);
    const records = await this.findAll();
    return records[indexOrThrow(records, ENTITY, id, (r) => r.id)] as Refund;
  }

  async findAll(): Promise<Refund[]> {
    return (await readAllFrom(this.#collections)).sort(byCreation);
  }

  async createRecord(data: CreateRefundInput): Promise<Refund> {
    if (!(PAYMENT_PROCESSORS as readonly string[]).includes(data.processor)) {
      throw invalidInput(`${ENTITY} processor must be one of ${PAYMENT_PROCESSORS.join(", ")}`);
    }
    const target = this.#processors[data.processor];
    const timestamp = this.#now().toISOString();
    const record = assertValidRefund(
      refundSchema.pick({ ...data, id: createId("rf"), processorReference: target.newReference(), createdAt: timestamp, updatedAt: timestamp }),
    );
    return target.collection.insert(record);
  }

  async updateRecord(id: string, data: UpdateRefundInput): Promise<Refund> {
    requireId(ENTITY, id);
    const owner = await ownerOf(this.#collections, ENTITY, id, (r) => r.id);
    return owner.update(id, (current) =>
      assertValidRefund(
        refundSchema.pick({
          ...current,
          ...data,
          id: current.id,
          processor: current.processor,
          processorReference: current.processorReference,
          createdAt: current.createdAt,
          updatedAt: this.#now().toISOString(),
        }),
      ),
    );
  }
}
