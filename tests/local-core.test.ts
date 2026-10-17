import { describe, it, expect } from "vitest";
import {
  applyOperations,
  db,
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  increment,
  deleteField,
  collectionSnapshot,
  type Database,
} from "../src/lib/local-core";
const base = (): Database => ({
  schemaVersion: 1,
  revision: 0,
  documents: {
    "users/Sumeitideas": {
      balance: 100,
      tags: ["a"],
      profile: { name: "Before", keep: true },
    },
    "users/Other": { balance: 20 },
    "orders/one/chat/a": {
      timestamp: "2026-10-01T00:00:00.000Z",
      message: "a",
    },
  },
});
describe("local JSON record engine", () => {
  it("applies atomic increments, unions, removals and deleted fields", () => {
    const ref = doc(db, "users", "Sumeitideas");
    const next = applyOperations(base(), [
      {
        kind: "update",
        ref,
        data: {
          balance: increment(-20),
          tags: arrayUnion("a", "b"),
          "profile.name": "After",
        },
      },
      {
        kind: "update",
        ref,
        data: { tags: arrayRemove("a"), "profile.keep": deleteField() },
      },
    ]);
    expect(next.documents[ref.path]).toEqual({
      balance: 80,
      tags: ["b"],
      profile: { name: "After" },
    });
  });
  it("does not mutate the source when a later operation fails", () => {
    const source = base();
    expect(() =>
      applyOperations(source, [
        {
          kind: "update",
          ref: doc(db, "users", "Sumeitideas"),
          data: { balance: 0 },
        },
        {
          kind: "update",
          ref: doc(db, "users", "missing"),
          data: { balance: 0 },
        },
      ]),
    ).toThrow();
    expect(source.documents["users/Sumeitideas"].balance).toBe(100);
  });
  it("replaces named maps while preserving unrelated fields", () => {
    const next = applyOperations(base(), [
      {
        kind: "set",
        ref: doc(db, "users", "Sumeitideas"),
        data: { profile: { name: "New" } },
        options: { mergeFields: ["profile"] },
      },
    ]);
    expect(next.documents["users/Sumeitideas"]).toEqual({
      balance: 100,
      tags: ["a"],
      profile: { name: "New" },
    });
  });
  it("merges individual nested fields when explicitly requested", () => {
    const next = applyOperations(base(), [
      {
        kind: "set",
        ref: doc(db, "users", "Sumeitideas"),
        data: { profile: { name: "New" } },
        options: { merge: true },
      },
    ]);
    expect(next.documents["users/Sumeitideas"].profile).toEqual({
      name: "New",
      keep: true,
    });
  });
  it("persists dates as ISO strings", () => {
    const next = applyOperations(base(), [
      {
        kind: "set",
        ref: doc(db, "invites", "code"),
        data: { expires_at: new Date("2026-11-01T00:00:00Z") },
      },
    ]);
    expect(next.documents["invites/code"].expires_at).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
  it("queries direct collection records without leaking subcollections", () => {
    const state = base();
    state.documents["users/Sumeitideas/private/nested"] = { balance: 999 };
    const result = collectionSnapshot(
      state,
      query(collection(db, "users"), orderBy("balance", "desc"), limit(1)),
    );
    expect(result.docs.map((d) => d.id)).toEqual(["Sumeitideas"]);
    expect(
      collectionSnapshot(
        state,
        query(collection(db, "users"), where("balance", "==", 20)),
      ).docs[0].id,
    ).toBe("Other");
    expect(
      collectionSnapshot(state, collection(db, "orders/one/chat")).size,
    ).toBe(1);
  });
  it("compares array objects independent of key ordering", () => {
    const next = applyOperations(base(), [
      {
        kind: "update",
        ref: doc(db, "users", "Sumeitideas"),
        data: { items: arrayUnion({ a: 1, b: 2 }, { b: 2, a: 1 }) },
      },
    ]);
    expect(next.documents["users/Sumeitideas"].items).toHaveLength(1);
  });
  it("rejects unsafe fields and nonfinite values", () => {
    expect(() =>
      applyOperations(base(), [
        {
          kind: "update",
          ref: doc(db, "users", "Sumeitideas"),
          data: { "__proto__.injected": true },
        },
      ]),
    ).toThrow();
    expect(() =>
      applyOperations(base(), [
        {
          kind: "update",
          ref: doc(db, "users", "Sumeitideas"),
          data: { balance: NaN },
        },
      ]),
    ).toThrow();
    expect(({} as any).injected).toBeUndefined();
  });
});
