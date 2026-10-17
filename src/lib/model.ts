export type Row = { id: string; [key: string]: any };
export const USERNAME = "Sumeitideas";
export const isAdmin = (u: Row | null) =>
  !!u && ["admin", "leader", "operator"].includes(u.role);
export const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : []);
export const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const label = (v: any) => String(v ?? "").replaceAll("_", " ");
export const when = (v: any) => {
  if (!v) return "—";
  const d = v.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(+d) ? String(v) : d.toLocaleString();
};
export function positive(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw Error("Enter a positive amount.");
  return n;
}
export function transitionWorker(
  job: Row,
  actor: string,
  action: string,
  target = actor,
  proof = "",
) {
  if (
    !["apply", "approve", "reject", "proof", "approveProof", "paid"].includes(
      action,
    )
  )
    throw Error("Unknown job action.");
  const workers = arr<Row>(job.workers).map((w) => ({ ...w }));
  const w = workers.find((x) => x.username === target);
  const owner = job.posted_by === actor;
  if (action === "apply") {
    if (job.status !== "open") throw Error("This job is not open.");
    if (actor === job.posted_by)
      throw Error("You cannot apply to your own job.");
    if (workers.some((x) => x.username === actor))
      throw Error("You have already applied.");
    if (
      workers.filter((x) =>
        [
          "working",
          "proof_uploaded",
          "approved_pending_payment",
          "completed_archived",
        ].includes(x.status),
      ).length >= num(job.max_workers || 1)
    )
      throw Error("This job is full.");
    workers.push({
      id: actor,
      username: actor,
      status: job.requires_approval ? "applied" : "working",
      proof_url: "",
    });
  } else {
    if (!w) throw Error("Worker not found.");
    if (action === "approve") {
      if (!owner || w.status !== "applied")
        throw Error("Only the owner can approve a pending worker.");
      if (
        workers.filter((x) =>
          [
            "working",
            "proof_uploaded",
            "approved_pending_payment",
            "completed_archived",
          ].includes(x.status),
        ).length >= num(job.max_workers || 1)
      )
        throw Error("This job is full.");
      w.status = "working";
    }
    if (action === "reject") {
      if (!owner || w.status !== "applied")
        throw Error("Only pending applications can be rejected.");
      return workers.filter((x) => x !== w);
    }
    if (action === "proof") {
      if (
        target !== actor ||
        !["working", "proof_uploaded"].includes(w.status) ||
        !/^https:\/\//.test(proof)
      )
        throw Error("A working applicant must supply an HTTPS proof URL.");
      w.status = "proof_uploaded";
      w.proof_url = proof;
    }
    if (action === "approveProof") {
      if (!owner || w.status !== "proof_uploaded")
        throw Error("Only the owner can approve uploaded proof.");
      w.status = "approved_pending_payment";
    }
    if (action === "paid") {
      if (target !== actor || w.status !== "approved_pending_payment")
        throw Error("Only the worker can confirm receipt of payment.");
      w.status = "completed_archived";
    }
  }
  return workers;
}
export function orderSettlement(order: Row, next: string) {
  if (
    ![
      "sent",
      "accepted",
      "processing",
      "delivering",
      "completed",
      "cancelled",
    ].includes(next)
  )
    throw Error("Invalid order status.");
  if (["completed", "cancelled"].includes(order.status))
    throw Error("This order is already closed.");
  if (order.currency !== "Emeralds" || order.escrow_released) return null;
  if (next === "completed")
    return {
      username: order.owner,
      amount: num(order.escrow_amount),
      type: "escrow_release",
    };
  if (next === "cancelled")
    return {
      username: order.buyer,
      amount: num(order.escrow_amount),
      type: "escrow_refund",
    };
  return null;
}
export function orderTotal(
  products: any[],
  items: Record<string, number>,
  currency: string,
) {
  if (!["Gold", "Emeralds"].includes(currency))
    throw Error("Unknown currency.");
  const chosen = Object.entries(items).filter(([, q]) => q !== 0);
  if (!chosen.length) throw Error("Add an item to your order.");
  let total = 0;
  for (const [name, qty] of chosen) {
    if (!Number.isInteger(qty) || qty <= 0)
      throw Error("Quantities must be positive whole numbers.");
    const p = products.find((p) => p.name === name);
    if (!p) throw Error("Product no longer available.");
    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0)
      throw Error("Invalid product price.");
    total += price * qty;
  }
  return currency === "Emeralds" ? Math.ceil(total * 100) : total;
}
export function dynamicLimit(user: Row, type: string, base: number) {
  const upgrades = arr(user.active_upgrades).filter(
    (u) => u.type === type && new Date(u.expires_at).getTime() > Date.now(),
  ).length;
  return (
    Math.max(
      base,
      num(user[type === "shop_limit" ? "shop_limit" : "job_limit"] || base),
    ) + upgrades
  );
}
