/** Minimal runtime record validation, so data read from disk is checked instead of trusted. */
export type FieldCheck = (value: unknown) => boolean;

export interface RecordSchema<T> {
  /** Type guard: true when `value` has every declared field with a valid value. */
  is(value: unknown): value is T;
  /** Names of missing or invalid fields (empty when valid). */
  problems(value: unknown): string[];
  /** Copies only the declared fields, dropping anything unknown. */
  pick(value: T): T;
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isString: FieldCheck = (value) => typeof value === "string";
export const isNonEmptyString: FieldCheck = (value) => typeof value === "string" && value.trim() !== "";
export const isBoolean: FieldCheck = (value) => typeof value === "boolean";
export const isNullableString: FieldCheck = (value) => value === null || isNonEmptyString(value);
export const isIsoDate: FieldCheck = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
export const isIntegerBetween =
  (min: number, max: number): FieldCheck =>
  (value) =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
export const isOneOf =
  <V extends string>(values: readonly V[]): FieldCheck =>
  (value) =>
    typeof value === "string" && (values as readonly string[]).includes(value);
export const isArrayOf =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    Array.isArray(value) && value.every(check);
export const isShape =
  (fields: Record<string, FieldCheck>): FieldCheck =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([key, check]) => check(value[key]));

/** Mapped over `keyof T`, so adding a field to the type without a check fails to compile. */
export function defineSchema<T extends object>(fields: { [K in keyof T]-?: FieldCheck }): RecordSchema<T> {
  const entries = Object.entries(fields) as [string, FieldCheck][];
  const problems = (value: unknown): string[] => {
    if (!isObject(value)) return ["<record>"];
    return entries.filter(([key, check]) => !check(value[key])).map(([key]) => key);
  };
  return {
    problems,
    is: (value): value is T => problems(value).length === 0,
    pick(value) {
      const source = value as Record<string, unknown>;
      return Object.fromEntries(entries.map(([key]) => [key, source[key]])) as T;
    },
  };
}
