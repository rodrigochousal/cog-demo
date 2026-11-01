import { deepClone } from "../util.js";
import { assertSynchronous, type DocumentStore, type Seed } from "./document-store.js";

/** Ephemeral in-memory store. Ideal for tests and throwaway demos. */
export function createMemoryStore<D>(name: string, seed: Seed<D>): DocumentStore<D> {
  let state: D = seed();
  return {
    name,
    read: () => deepClone(state),
    transact(fn) {
      const draft = deepClone(state);
      const result = assertSynchronous(fn(draft));
      state = draft;
      return result;
    },
  };
}
