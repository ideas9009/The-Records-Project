export type Database = {
  schemaVersion: 1;
  revision: number;
  documents: Record<string, Record<string, any>>;
};
export type Ref = {
  path: string;
  id: string;
  kind: "document" | "collection";
  filters?: Filter[];
};
type Filter = {
  kind: "where" | "order" | "limit";
  field?: string;
  value?: any;
  direction?: "asc" | "desc";
};
export type SetOptions = { merge?: boolean; mergeFields?: string[] };
export type Operation = {
  kind: "set" | "update" | "delete";
  ref: Ref;
  data?: Record<string, any>;
  options?: SetOptions;
};
const transform = Symbol("local-database-transform");
export const arrayUnion = (...values: any[]) => ({
  [transform]: "union",
  values,
});
export const arrayRemove = (...values: any[]) => ({
  [transform]: "remove",
  values,
});
export const increment = (value: number) => ({
  [transform]: "increment",
  value,
});
export const deleteField = () => ({ [transform]: "delete" });
export const serverTimestamp = () => new Date().toISOString();
export const db = { path: "" };
function reference(path: string, kind: Ref["kind"]): Ref {
  const segments = path.split("/");
  if (
    segments.some(
      (p) => !p || ["__proto__", "prototype", "constructor"].includes(p),
    ) ||
    (segments.length % 2 === 0) !== (kind === "document")
  )
    throw Error("Invalid local record path: " + path);
  return { path, id: segments.at(-1)!, kind };
}
export const collection = (_parent: unknown, ...segments: string[]) =>
  reference(segments.join("/"), "collection");
export function doc(parent: { path?: string }, ...segments: string[]) {
  return reference(
    [
      ...(parent.path ? [parent.path] : []),
      ...(segments.length ? segments : [crypto.randomUUID()]),
    ].join("/"),
    "document",
  );
}
export const where = (field: string, operator: string, value: any): Filter => {
  if (operator !== "==") throw Error("Unsupported query operator");
  return { kind: "where", field, value };
};
export const orderBy = (
  field: string,
  direction: "asc" | "desc" = "asc",
): Filter => ({ kind: "order", field, direction });
export const limit = (value: number): Filter => ({ kind: "limit", value });
export const query = (ref: Ref, ...filters: Filter[]): Ref => ({
  ...ref,
  filters,
});
function canonical(value: any): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const equal = (a: any, b: any) => canonical(a) === canonical(b);
function safeKey(key: string) {
  if (!key || ["__proto__", "prototype", "constructor"].includes(key))
    throw Error("Invalid field name.");
}
function normalize(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) throw Error("Undefined values cannot be saved.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Invalid numeric value.");
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      safeKey(key);
      out[key] = normalize(item);
    }
    return out;
  }
  return value;
}
function getField(row: any, path: string) {
  return path.split(".").reduce((value, key) => value?.[key], row);
}
function putField(row: any, path: string, value: any) {
  const parts = path.split(".");
  parts.forEach(safeKey);
  let parent = row;
  for (const key of parts.slice(0, -1)) {
    if (
      !parent[key] ||
      typeof parent[key] !== "object" ||
      Array.isArray(parent[key])
    )
      parent[key] = {};
    parent = parent[key];
  }
  const key = parts.at(-1)!,
    old = parent[key];
  switch (value?.[transform]) {
    case "delete":
      delete parent[key];
      break;
    case "increment":
      if (!Number.isFinite(value.value)) throw Error("Invalid increment");
      parent[key] = (typeof old === "number" ? old : 0) + value.value;
      if (!Number.isFinite(parent[key])) throw Error("Invalid result");
      break;
    case "union":
      parent[key] = Array.isArray(old) ? [...old] : [];
      for (const item of value.values.map(normalize))
        if (!parent[key].some((v: any) => equal(v, item)))
          parent[key].push(item);
      break;
    case "remove":
      parent[key] = (Array.isArray(old) ? old : []).filter(
        (v) => !value.values.some((item: any) => equal(v, normalize(item))),
      );
      break;
    default:
      parent[key] = normalize(value);
  }
}
function deepMerge(row: any, data: any, prefix = "") {
  for (const [key, value] of Object.entries(data)) {
    safeKey(key);
    const field = prefix ? prefix + "." + key : key;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value as any)[transform] &&
      Object.keys(value).length
    )
      deepMerge(row, value, field);
    else putField(row, field, value);
  }
}
export function applyOperations(
  base: Database,
  operations: Operation[],
): Database {
  const next = structuredClone(base);
  for (const op of operations) {
    reference(op.ref.path, "document");
    const old = next.documents[op.ref.path];
    if (op.kind === "delete") {
      delete next.documents[op.ref.path];
      continue;
    }
    if (op.kind === "update" && !old)
      throw Error("Record not found: " + op.ref.path);
    const row =
      op.kind === "set" && !op.options?.merge && !op.options?.mergeFields
        ? {}
        : structuredClone(old || {});
    if (op.kind === "set" && op.options?.merge) deepMerge(row, op.data || {});
    else if (op.options?.mergeFields)
      for (const key of op.options.mergeFields)
        putField(row, key, getField(op.data, key));
    else
      for (const [key, value] of Object.entries(op.data || {}))
        putField(row, key, value);
    next.documents[op.ref.path] = row;
  }
  return next;
}
export function documentSnapshot(state: Database, ref: Ref) {
  const value = state.documents[ref.path];
  return {
    id: ref.id,
    ref,
    exists: () => value !== undefined,
    data: (): Record<string, any> =>
      value === undefined ? (undefined as any) : structuredClone(value),
  };
}
export function collectionSnapshot(state: Database, ref: Ref) {
  let paths = Object.keys(state.documents)
    .filter(
      (path) =>
        path.startsWith(ref.path + "/") &&
        path.split("/").length === ref.path.split("/").length + 1,
    )
    .sort();
  for (const f of ref.filters || []) {
    if (f.kind === "where")
      paths = paths.filter((p) =>
        equal(getField(state.documents[p], f.field!), f.value),
      );
    if (f.kind === "order")
      paths = paths
        .filter((p) => getField(state.documents[p], f.field!) !== undefined)
        .sort((a, b) => {
          const x = getField(state.documents[a], f.field!),
            y = getField(state.documents[b], f.field!);
          return (
            (x === y ? 0 : x > y ? 1 : -1) * (f.direction === "desc" ? -1 : 1)
          );
        });
  }
  for (const f of ref.filters || [])
    if (f.kind === "limit") paths = paths.slice(0, f.value);
  const docs = paths.map((path) =>
    documentSnapshot(state, reference(path, "document")),
  );
  return { docs, size: docs.length, empty: !docs.length };
}
