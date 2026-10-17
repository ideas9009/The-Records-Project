import { beforeEach, describe, it, expect, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  state: { schemaVersion: 1, revision: 0, documents: {} } as any,
  conflict: false,
  failed: false,
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: vi.fn(async (command: string, args: any) => {
    if (command === "database_read") return structuredClone(fixture.state);
    if (command === "database_commit") {
      if (fixture.failed) throw Error("Disk full");
      if (fixture.conflict) {
        fixture.conflict = false;
        fixture.state.revision++;
        fixture.state.documents["users/Sumeitideas"].balance += 5;
        throw Error("REVISION_CONFLICT");
      }
      if (args.expectedRevision !== fixture.state.revision)
        throw Error("REVISION_CONFLICT");
      fixture.state = {
        schemaVersion: 1,
        revision: fixture.state.revision + 1,
        documents: structuredClone(args.documents),
      };
      return structuredClone(fixture.state);
    }
  }),
}));
import {
  db,
  doc,
  runTransaction,
  increment,
  writeBatch,
  updateDoc,
  getDoc,
} from "../src/lib/local-database";
beforeEach(() => {
  fixture.state = {
    schemaVersion: 1,
    revision: 0,
    documents: { "users/Sumeitideas": { balance: 100 } },
  };
  fixture.conflict = false;
  fixture.failed = false;
});
describe("local commit transport", () => {
  it("retries on concurrent changes without losing the other write", async () => {
    fixture.conflict = true;
    await runTransaction(db, async (t) => {
      const ref = doc(db, "users", "Sumeitideas");
      const record = await t.get(ref);
      t.update(ref, { balance: record.data().balance - 10 });
    });
    expect(fixture.state.documents["users/Sumeitideas"].balance).toBe(95);
  });
  it("commits a batch as one revision", async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, "users", "Sumeitideas"), { balance: increment(-20) });
    batch.set(doc(db, "users", "Other"), { balance: 20 });
    await batch.commit();
    expect(fixture.state.revision).toBe(1);
    expect(fixture.state.documents["users/Other"].balance).toBe(20);
  });
  it("surfaces disk failures without claiming the update succeeded", async () => {
    fixture.failed = true;
    await expect(
      updateDoc(doc(db, "users", "Sumeitideas"), { balance: 0 }),
    ).rejects.toThrow("Disk full");
    expect((await getDoc(doc(db, "users", "Sumeitideas"))).data().balance).toBe(
      100,
    );
  });
});
