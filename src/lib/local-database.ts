import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  applyOperations,
  documentSnapshot,
  collectionSnapshot,
  doc,
  type Database,
  type Ref,
  type Operation,
  type SetOptions,
} from "./local-core";
export * from "./local-core";
async function request(method: string, body?: unknown) {
  const response = await fetch("/__records/database", {
    method,
    headers: { "Content-Type": "application/json", "X-Records-Local": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw Error(await response.text());
  return response.json();
}
async function load(): Promise<Database> {
  return isTauri() ? invoke("database_read") : request("GET");
}
async function commit(state: Database): Promise<Database> {
  return isTauri()
    ? invoke("database_commit", {
        expectedRevision: state.revision,
        documents: state.documents,
      })
    : request("PUT", {
        expectedRevision: state.revision,
        documents: state.documents,
      });
}
export async function databasePath(): Promise<string> {
  return isTauri()
    ? invoke("database_path")
    : request("POST", { action: "path" }).then((r) => r.path);
}
type Listener = {
  ref: Ref;
  next: (value: any) => void;
  error: (e: Error) => void;
  last?: string;
};
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | undefined,
  pending: Promise<void> | undefined;
function publish(state: Database) {
  for (const listener of listeners) {
    const snapshot =
      listener.ref.kind === "document"
        ? documentSnapshot(state, listener.ref)
        : collectionSnapshot(state, listener.ref);
    const key =
      JSON.stringify(
        "docs" in snapshot
          ? snapshot.docs.map((d) => [d.id, d.data()])
          : snapshot.data(),
      ) ?? "missing";
    if (key !== listener.last || listener.last === undefined) {
      listener.last = key ?? "missing";
      listener.next(snapshot);
    }
  }
}
function refresh() {
  if (!pending)
    pending = load()
      .then(publish)
      .catch((error) => {
        for (const listener of listeners) {
          listener.last = undefined;
          listener.error(new Error(String(error)));
        }
      })
      .finally(() => {
        pending = undefined;
      });
  return pending;
}
export function onSnapshot(
  ref: Ref,
  next: (snapshot: any) => void,
  error: (e: Error) => void,
) {
  const listener = { ref, next, error };
  listeners.add(listener);
  void refresh();
  if (!timer) timer = setInterval(() => void refresh(), 1000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export async function getDoc(ref: Ref) {
  return documentSnapshot(await load(), ref);
}
export async function getDocs(ref: Ref) {
  return collectionSnapshot(await load(), ref);
}
export type Transaction = {
  get: (ref: Ref) => Promise<ReturnType<typeof documentSnapshot>>;
  set: (ref: Ref, data: Record<string, any>, options?: SetOptions) => void;
  update: (ref: Ref, data: Record<string, any>) => void;
  delete: (ref: Ref) => void;
};
export async function runTransaction<T>(
  _db: unknown,
  fn: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const base = await load(),
      operations: Operation[] = [];
    const result = await fn({
      get: async (ref) => {
        if (operations.length)
          throw Error("Read records before updating them in a transaction.");
        return documentSnapshot(base, ref);
      },
      set: (ref, data, options) => {
        operations.push({ kind: "set", ref, data, options });
      },
      update: (ref, data) => {
        operations.push({ kind: "update", ref, data });
      },
      delete: (ref) => {
        operations.push({ kind: "delete", ref });
      },
    });
    if (!operations.length) return result;
    try {
      const saved = await commit(applyOperations(base, operations));
      publish(saved);
      return result;
    } catch (error) {
      if (!String(error).includes("REVISION_CONFLICT")) throw error;
    }
  }
  throw Error("The database changed repeatedly. Please try again.");
}
export function writeBatch(_db: unknown) {
  const operations: Operation[] = [];
  const batch = {
    set: (ref: Ref, data: Record<string, any>, options?: SetOptions) => {
      operations.push({ kind: "set", ref, data, options });
      return batch;
    },
    update: (ref: Ref, data: Record<string, any>) => {
      operations.push({ kind: "update", ref, data });
      return batch;
    },
    delete: (ref: Ref) => {
      operations.push({ kind: "delete", ref });
      return batch;
    },
    commit: () =>
      runTransaction(_db, async (transaction) => {
        for (const op of operations) {
          if (op.kind === "delete") transaction.delete(op.ref);
          else if (op.kind === "update") transaction.update(op.ref, op.data!);
          else transaction.set(op.ref, op.data!, op.options);
        }
      }),
  };
  return batch;
}
export const setDoc = (
  ref: Ref,
  data: Record<string, any>,
  options?: SetOptions,
) =>
  runTransaction(null, async (t) => {
    t.set(ref, data, options);
  });
export const updateDoc = (ref: Ref, data: Record<string, any>) =>
  runTransaction(null, async (t) => {
    t.update(ref, data);
  });
export const deleteDoc = (ref: Ref) =>
  runTransaction(null, async (t) => {
    t.delete(ref);
  });
export async function addDoc(ref: Ref, data: Record<string, any>) {
  const target = doc(ref);
  await setDoc(target, data);
  return target;
}
