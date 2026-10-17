import { beforeEach, describe, it, expect, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  records: new Map<string, any>(),
  sequence: 0,
}));
vi.mock("../src/lib/cloud-database", () => {
  const ref = (path: string) => ({ path, id: path.split("/").at(-1) });
  const snap = (r: any) => ({
    ref: r,
    id: r.id,
    exists: () => fixture.records.has(r.path),
    data: () => fixture.records.get(r.path),
  });
  const col = (_: any, ...segments: string[]) => ref(segments.join("/"));
  const doc = (parent: any, ...segments: string[]) =>
    ref(
      parent?.path
        ? [
            parent.path,
            ...(segments.length ? segments : [String(++fixture.sequence)]),
          ].join("/")
        : segments.join("/"),
    );
  const merge = (target: any, values: any) => {
    const next = structuredClone(target || {});
    for (const [key, value] of Object.entries(values)) {
      const bits = key.split(".");
      let node = next;
      for (const part of bits.slice(0, -1)) node = node[part] ??= {};
      const k = bits.at(-1)!;
      const v = value as any;
      if (v?.op === "increment") node[k] = (node[k] || 0) + v.value;
      else if (v?.op === "union")
        node[k] = [
          ...new Map(
            [...(node[k] || []), ...v.value].map((x) => [JSON.stringify(x), x]),
          ).values(),
        ];
      else if (v?.op === "remove")
        node[k] = (node[k] || []).filter(
          (x: any) =>
            !v.value.some((y: any) => JSON.stringify(x) === JSON.stringify(y)),
        );
      else node[k] = v;
    }
    return next;
  };
  const update = (r: any, v: any) => {
    if (!fixture.records.has(r.path)) throw Error("Missing " + r.path);
    fixture.records.set(r.path, merge(fixture.records.get(r.path), v));
  };
  const set = (r: any, v: any, options?: any) =>
    fixture.records.set(
      r.path,
      options?.merge ? merge(fixture.records.get(r.path), v) : merge({}, v),
    );
  return {
    db: {},
    collection: col,
    doc,
    getDoc: async (r: any) => snap(r),
    query: (r: any, ...filters: any[]) => ({ ...r, filters }),
    where: (key: string, _: string, value: any) => ({ key, value }),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn(),
    getDocs: async (r: any) => {
      const docs = [...fixture.records.keys()]
        .filter(
          (k) =>
            k.startsWith(r.path + "/") &&
            k.split("/").length === r.path.split("/").length + 1,
        )
        .map((k) => snap(ref(k)))
        .filter((s) =>
          (r.filters || []).every(
            (f: any) => !f || s.data()[f.key] === f.value,
          ),
        );
      return { docs, size: docs.length };
    },
    updateDoc: async (r: any, v: any) => update(r, v),
    setDoc: async (r: any, v: any, o: any) => set(r, v, o),
    deleteDoc: async (r: any) => fixture.records.delete(r.path),
    addDoc: async (r: any, v: any) => {
      const d = doc(r);
      set(d, v);
      return d;
    },
    runTransaction: async (_: any, fn: any) => {
      const writes: (() => void)[] = [];
      await fn({
        get: async (r: any) => {
          if (writes.length) throw Error("Read after write");
          return snap(r);
        },
        update: (r: any, v: any) => writes.push(() => update(r, v)),
        set: (r: any, v: any) => writes.push(() => set(r, v)),
        delete: (r: any) => writes.push(() => fixture.records.delete(r.path)),
      });
      writes.forEach((w) => w());
    },
    writeBatch: vi.fn(),
    arrayUnion: (...value: any[]) => ({ op: "union", value }),
    arrayRemove: (...value: any[]) => ({ op: "remove", value }),
    increment: (value: number) => ({ op: "increment", value }),
    serverTimestamp: () => new Date(),
    deleteField: () => ({ op: "delete" }),
  };
});
import {
  claimTutorial,
  setHunter,
  createJob,
  placeOrder,
  orderStatus,
  workerAction,
  materialAction,
  townMayor,
  editTown,
  buyConsulting,
  createInvite,
  townRestrictions,
} from "../src/lib/data";
const put = (path: string, data: any) => fixture.records.set(path, data);
const get = (path: string) => fixture.records.get(path);
beforeEach(() => {
  fixture.records.clear();
  fixture.sequence = 0;
  put("users/Sumeitideas", {
    username: "Sumeitideas",
    role: "operator",
    balance: 2000,
  });
  put("users/owner", { username: "owner", role: "citizen", balance: 0 });
  put("system/settings", {});
});
describe("cloud record workflows with an isolated in-memory adapter", () => {
  it("publishes requested worker capacity and blocks locked boards", async () => {
    const id = await createJob({ title: "Build", max_workers: 3 });
    expect(get("jobs/" + id).max_workers).toBe(3);
    put("system/settings", { job_board_locked: true });
    await expect(createJob({ title: "Other" })).rejects.toThrow("locked");
  });
  it("takes current catalogue prices and refunds escrow only once", async () => {
    put("companies/sand", {
      owner: "owner",
      products: [{ name: "Sand", price: 2.5 }],
    });
    await placeOrder(
      { id: "sand", products: [] },
      { Sand: 2 },
      "Emeralds",
      "Capital",
    );
    const path = [...fixture.records.keys()].find((k) =>
      k.startsWith("company_orders/"),
    )!;
    expect(get(path).total_price).toBe(500);
    expect(get("users/Sumeitideas").balance).toBe(1500);
    await orderStatus(path.split("/")[1], "cancelled");
    expect(get("users/Sumeitideas").balance).toBe(2000);
    await expect(
      orderStatus(path.split("/")[1], "cancelled"),
    ).rejects.toThrow();
    expect(get("users/Sumeitideas").balance).toBe(2000);
  });
  it("awards job completion once and archives a fully completed job", async () => {
    put("jobs/j", {
      status: "open",
      posted_by: "owner",
      max_workers: 1,
      workers: [
        { username: "Sumeitideas", status: "approved_pending_payment" },
      ],
    });
    await workerAction("j", "paid");
    expect(get("users/Sumeitideas").balance).toBe(2020);
    expect(get("jobs/j").status).toBe("archived");
    await expect(workerAction("j", "paid")).rejects.toThrow();
    expect(get("users/Sumeitideas").balance).toBe(2020);
  });
  it("does not allow another citizen to confirm material delivery", async () => {
    put("materials/m", {
      requester: "owner",
      fulfilled_by: "Sumeitideas",
      status: "pending_requester",
    });
    await expect(materialAction("m", "delivery")).rejects.toThrow("requester");
    expect(get("materials/m").status).toBe("pending_requester");
  });
  it("keeps operator role when assuming mayorship and demotes the old mayor", async () => {
    put("towns/A", { name: "A", mayor: "owner" });
    put("users/owner", { role: "mayor" });
    await townMayor("A", "Sumeitideas");
    expect(get("users/Sumeitideas").role).toBe("operator");
    expect(get("users/owner").role).toBe("citizen");
    expect(get("towns/A").mayor).toBe("Sumeitideas");
  });
  it("renames a town with residents, shops, management and diplomacy intact", async () => {
    put("towns/A", {
      name: "A",
      mayor: "owner",
      screenshots: ["https://image"],
    });
    put("users/owner", { town: "A" });
    put("shops/s", { town_name: "A", title: "Store" });
    put("town_management/A", { bulletin: "Old bulletin" });
    put("diplomacy/global", { allies: ["A"], enemies: [] });
    await editTown("A", { name: "B", chunks: 30 });
    expect(get("towns/A")).toBeUndefined();
    expect(get("towns/B").screenshots).toEqual(["https://image"]);
    expect(get("users/owner").town).toBe("B");
    expect(get("shops/s").town_name).toBe("B");
    expect(get("town_management/B").bulletin).toBe("Old bulletin");
    expect(get("diplomacy/global").allies).toEqual(["B"]);
  });
  it("rejects a rename when the destination exists before changing anything", async () => {
    put("towns/A", { name: "A" });
    put("towns/B", { name: "B" });
    await expect(editTown("A", { name: "B" })).rejects.toThrow("already");
    expect(get("towns/A").name).toBe("A");
  });
  it("town bans move only residents of that town to Nomad", async () => {
    put("towns/A", { mayor: "mayor" });
    put("users/owner", { town: "Elsewhere" });
    put("users/Sumeitideas", { town: "A" });
    await townRestrictions("A", ["owner", "Sumeitideas"]);
    expect(get("users/owner").town).toBe("Elsewhere");
    expect(get("users/Sumeitideas").town).toBe("Nomad");
  });
  it("records consulting payment and operator notification together", async () => {
    await buyConsulting();
    expect(get("users/Sumeitideas").balance).toBe(1000);
    expect(get("users/Sumeitideas").notifications[0].type).toBe(
      "consulting_request",
    );
  });
  it("uses a native date for invite expiry and protects duplicate codes", async () => {
    await createInvite("JOIN", 2, 24);
    expect(get("invites/JOIN").expires_at).toBeInstanceOf(Date);
    await expect(createInvite("JOIN", 4, 0)).rejects.toThrow("already");
    expect(get("invites/JOIN").uses_left).toBe(2);
  });
});

describe("tutorial and hunter compatibility", () => {
  it("awards the tutorial only once", async () => {
    await claimTutorial();
    await claimTutorial();
    expect(get("users/Sumeitideas").balance).toBe(2100);
  });
  it("preserves legacy hunter date types and removes only the chosen entry", async () => {
    put("diplomacy/global", {
      allies: ["Ally"],
      hunters: { old: { permanent: true } },
    });
    await setHunter("NewHunter", 30, false);
    expect(get("diplomacy/global").hunters.newhunter.expires_at).toBeInstanceOf(
      Date,
    );
    expect(get("diplomacy/global").allies).toEqual(["Ally"]);
    await setHunter("NewHunter", 0, false, true);
    expect(get("diplomacy/global").hunters.newhunter).toBeUndefined();
    expect(get("diplomacy/global").hunters.old).toBeDefined();
  });
});
