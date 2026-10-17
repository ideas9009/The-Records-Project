import { describe, it, expect } from "vitest";
import {
  transitionWorker,
  orderSettlement,
  positive,
  Row,
} from "../src/lib/model";
const job: Row = {
  id: "1",
  posted_by: "owner",
  status: "open",
  max_workers: 1,
  requires_approval: true,
  workers: [],
};
describe("legacy job compatibility", () => {
  it("uses the legacy applied status", () =>
    expect(transitionWorker(job, "worker", "apply")[0].status).toBe("applied"));
  it("prevents duplicate applications", () =>
    expect(() =>
      transitionWorker(
        { ...job, workers: [{ username: "worker", status: "applied" }] },
        "worker",
        "apply",
      ),
    ).toThrow());
  it("prevents approval past capacity", () =>
    expect(() =>
      transitionWorker(
        {
          ...job,
          workers: [
            { username: "a", status: "working" },
            { username: "b", status: "applied" },
          ],
        },
        "owner",
        "approve",
        "b",
      ),
    ).toThrow());
  it("does not let the owner confirm a worker payment", () =>
    expect(() =>
      transitionWorker(
        {
          ...job,
          workers: [{ username: "worker", status: "approved_pending_payment" }],
        },
        "owner",
        "paid",
        "worker",
      ),
    ).toThrow());
  it("only awards completion once", () => {
    const workers = transitionWorker(
      {
        ...job,
        workers: [{ username: "worker", status: "approved_pending_payment" }],
      },
      "worker",
      "paid",
    );
    expect(workers[0].status).toBe("completed_archived");
    expect(() =>
      transitionWorker({ ...job, workers }, "worker", "paid"),
    ).toThrow();
  });
  it("requires HTTPS proof from the worker", () =>
    expect(() =>
      transitionWorker(
        { ...job, workers: [{ username: "worker", status: "working" }] },
        "worker",
        "proof",
        "worker",
        "javascript:alert(1)",
      ),
    ).toThrow());
  it("does not mutate the source snapshot", () => {
    const original = {
      ...job,
      workers: [{ username: "worker", status: "applied" }],
    };
    transitionWorker(original, "owner", "approve", "worker");
    expect(original.workers[0].status).toBe("applied");
  });
});
describe("order escrow", () => {
  const order: Row = {
    id: "o",
    status: "sent",
    currency: "Emeralds",
    escrow_amount: 20,
    escrow_released: false,
    buyer: "buyer",
    owner: "owner",
  };
  it("refunds buyer on cancellation", () =>
    expect(orderSettlement(order, "cancelled")).toEqual({
      username: "buyer",
      amount: 20,
      type: "escrow_refund",
    }));
  it("pays owner on completion", () =>
    expect(orderSettlement(order, "completed")?.username).toBe("owner"));
  it("never moves Gold balances", () =>
    expect(
      orderSettlement({ ...order, currency: "Gold" }, "completed"),
    ).toBeNull());
  it("cannot settle a closed order twice", () =>
    expect(() =>
      orderSettlement({ ...order, status: "completed" }, "completed"),
    ).toThrow());
  it("does not release escrow twice", () =>
    expect(
      orderSettlement({ ...order, escrow_released: true }, "completed"),
    ).toBeNull());
  it("rejects negative and non-finite transfers", () => {
    for (const v of [-1, 0, NaN, Infinity]) expect(() => positive(v)).toThrow();
  });
});

import { orderTotal, dynamicLimit } from "../src/lib/model";
describe("legacy commerce compatibility", () => {
  it("converts Gold prices to Emeralds at the existing 100:1 rate", () =>
    expect(
      orderTotal([{ name: "Sand", price: 2.5 }], { Sand: 2 }, "Emeralds"),
    ).toBe(500));
  it("keeps Gold totals unchanged", () =>
    expect(
      orderTotal([{ name: "Sand", price: 2.5 }], { Sand: 2 }, "Gold"),
    ).toBe(5));
  it("rejects a removed product at checkout", () =>
    expect(() => orderTotal([], { Sand: 2 }, "Gold")).toThrow());
  it("rejects negative or fractional quantities", () => {
    for (const q of [-1, 1.5])
      expect(() =>
        orderTotal([{ name: "Sand", price: 2 }], { Sand: q }, "Gold"),
      ).toThrow();
  });
  it("ignores expired upgrades", () =>
    expect(
      dynamicLimit(
        {
          id: "u",
          shop_limit: 5,
          active_upgrades: [{ type: "shop_limit", expires_at: "2000-01-01" }],
        },
        "shop_limit",
        5,
      ),
    ).toBe(5));
  it("adds active upgrades to legacy limits", () =>
    expect(
      dynamicLimit(
        {
          id: "u",
          shop_limit: 6,
          active_upgrades: [{ type: "shop_limit", expires_at: "2099-01-01" }],
        },
        "shop_limit",
        5,
      ),
    ).toBe(7));
});
