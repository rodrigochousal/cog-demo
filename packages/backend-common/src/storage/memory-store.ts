import { deepClone } from "../util.js";
import type { DocumentStore, Seed } from "./document-store.js";

/** Ephemeral in-memory store. Ideal for tests and throwaway demos. */
export function createMemoryStore<D>(name: string, seed: Seed<D>): DocumentStore<D> {
  let state: D = seed();
  return {
    name,
    read: () => deepClone(state),
    transact(fn) {
      const draft = deepClone(state);
      const result = fn(draft);
      state = draft;
      return result;
    },
  };
}
