import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  deleteField,
} from "./cloud-database";
import { db } from "./cloud-database";
import {
  Row,
  USERNAME,
  arr,
  num,
  positive,
  transitionWorker,
  orderSettlement,
  orderTotal,
  dynamicLimit,
} from "./model";
export { arrayUnion, arrayRemove, increment, deleteField };
export function clean(row: Row): Row {
  const x = { ...row };
  for (const k of Object.keys(x))
    if (/password|secret|token|api.?key|webhook/i.test(k)) delete x[k];
  return x;
}
export function useRows(path: string, filter?: [string, any], sort?: string) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const key = JSON.stringify(filter);
  useEffect(() => {
    setRows([]);
    setLoading(true);
    setError("");
    const q = query(
      collection(db, path),
      ...(filter ? [where(filter[0], "==", filter[1])] : []),
      ...(sort ? [orderBy(sort, "desc"), limit(150)] : []),
    );
    return onSnapshot(
      q,
      (s) => {
        setError("");
        setRows(s.docs.map((d: any) => clean({ ...d.data(), id: d.id })));
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [path, key, sort]);
  return { rows, error, loading };
}
export function useRecord(path: string) {
  const [row, setRow] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    setRow(null);
    return onSnapshot(
      doc(db, path),
      (s) => {
        setError("");
        setRow(s.exists() ? clean({ ...s.data(), id: s.id }) : null);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, [path]);
  return { row, error, loading };
}
export async function audit(action: string) {
  await addDoc(collection(db, "audit_logs"), {
    username: USERNAME,
    action,
    timestamp: serverTimestamp(),
  });
}
export async function save(path: string, data: Record<string, any>) {
  await setDoc(doc(db, path), data, { mergeFields: Object.keys(data) });
}
export async function patch(path: string, data: Record<string, any>) {
  await updateDoc(doc(db, path), data);
}
export async function create(path: string, data: Record<string, any>) {
  const id = crypto.randomUUID();
  await setDoc(doc(db, path, id), { ...data, id });
  return id;
}
export async function remove(path: string) {
  await deleteDoc(doc(db, path));
}
export async function read(path: string) {
  const s = await getDoc(doc(db, path));
  return s.exists() ? clean({ ...s.data(), id: s.id }) : null;
}
export async function notify(to: string, message: string, type = "info") {
  await patch("users/" + to, {
    notifications: arrayUnion({
      id: crypto.randomUUID(),
      message,
      type,
      read: false,
      timestamp: Date.now(),
    }),
  });
}
export async function upload(file: File) {
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
    throw Error("Choose an image smaller than 10 MB.");
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", "ml_default");
  const r = await fetch(
    "https://api.cloudinary.com/v1_1/dj3bugspg/image/upload",
    { method: "POST", body },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error?.message || "Upload failed");
  return data.secure_url as string;
}
export async function workerAction(
  jobId: string,
  action: string,
  target = USERNAME,
  proof = "",
) {
  if (action === "apply") {
    const user = await read("users/" + USERNAME);
    const jobs = await listOnce("jobs");
    const active = jobs.filter(
      (j) =>
        j.status !== "archived" &&
        arr(j.workers).some(
          (w) =>
            w.username === USERNAME &&
            !["completed_archived", "rejected"].includes(w.status),
        ),
    ).length;
    if (active >= dynamicLimit(user!, "job_apply_limit", 3))
      throw Error("Your active job limit has been reached.");
  }
  await runTransaction(db, async (t) => {
    const ref = doc(db, "jobs", jobId),
      s = await t.get(ref);
    if (!s.exists()) throw Error("Job not found");
    const j = { ...s.data(), id: s.id } as Row;
    const workers = transitionWorker(j, USERNAME, action, target, proof);
    if (action === "apply") {
      const settings = await t.get(doc(db, "system/settings"));
      if (settings.data()?.job_board_locked)
        throw Error("The job board is locked.");
    }
    const completed = workers.filter(
      (w) => w.status === "completed_archived",
    ).length;
    t.update(ref, {
      workers: workers.map(({ id, ...w }) => w),
      status: completed >= num(j.max_workers || 1) ? "archived" : j.status,
    });
    if (action === "paid")
      t.update(doc(db, "users", target), {
        trust_level: increment(5),
        rank_points: increment(5),
        balance: increment(20),
      });
  });
}
export async function jobSlots(id: string) {
  await runTransaction(db, async (t) => {
    const ref = doc(db, "jobs", id),
      s = await t.get(ref),
      j = s.data();
    if (!j || j.posted_by !== USERNAME)
      throw Error("Only the owner can add slots.");
    if (
      arr(j.workers).filter((w) => w.status !== "applied").length <
      num(j.max_workers || 1)
    )
      throw Error("Fill the existing slots first.");
    t.update(ref, { max_workers: num(j.max_workers || 1) + 1, status: "open" });
  });
}
export async function deleteJob(id: string) {
  await runTransaction(db, async (t) => {
    const ref = doc(db, "jobs", id),
      s = await t.get(ref);
    if (arr(s.data()?.workers).some((w) => w.status !== "completed_archived"))
      throw Error("Jobs with active workers cannot be deleted.");
    t.delete(ref);
  });
}
export async function transfer(to: string, amount: number) {
  amount = positive(amount);
  if (!Number.isInteger(amount) || to === USERNAME)
    throw Error("Choose another citizen and a whole amount.");
  await runTransaction(db, async (t) => {
    const a = doc(db, "users", USERNAME),
      b = doc(db, "users", to),
      sa = await t.get(a),
      sb = await t.get(b);
    if (!sb.exists()) throw Error("Recipient not found.");
    if (num(sa.data()?.balance) < amount)
      throw Error("Insufficient Emerald balance.");
    t.update(a, { balance: increment(-amount) });
    t.update(b, { balance: increment(amount) });
    for (const [username, value] of [
      [USERNAME, -amount],
      [to, amount],
    ] as const)
      t.set(doc(collection(db, "transactions")), {
        username,
        amount: value,
        type: "transfer",
        description: "Transfer " + USERNAME + " → " + to,
        timestamp: new Date().toISOString(),
      });
  });
}
export async function placeOrder(
  company: Row,
  items: Record<string, number>,
  currency: string,
  delivery: string,
) {
  const chosen = Object.entries(items).filter(([, q]) => q > 0);
  if (!chosen.length) throw Error("Add an item to your order.");
  await runTransaction(db, async (t) => {
    const ref = doc(db, "companies", company.id),
      s = await t.get(ref),
      c = s.data();
    if (!c || c.status === "closed") throw Error("Company is closed.");
    let total = orderTotal(
      arr(c.products),
      Object.fromEntries(chosen),
      currency,
    );
    if (currency === "Emeralds") {
      const u = await t.get(doc(db, "users", USERNAME));
      if (num(u.data()?.balance) < total) throw Error("Insufficient Emeralds.");
    }
    const order = doc(collection(db, "company_orders"));
    t.set(order, {
      id: order.id,
      company_id: company.id,
      buyer: USERNAME,
      owner: c.owner,
      items: Object.fromEntries(chosen),
      total_price: total,
      escrow_amount: currency === "Emeralds" ? total : 0,
      escrow_released: false,
      currency,
      delivery_location: delivery,
      status: "sent",
      created_at: new Date().toISOString(),
    });
    if (currency === "Emeralds") {
      t.update(doc(db, "users", USERNAME), { balance: increment(-total) });
      t.set(doc(collection(db, "transactions")), {
        username: USERNAME,
        amount: -total,
        type: "escrow",
        description: "Order " + order.id,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
export async function orderStatus(id: string, next: string, admin = false) {
  await runTransaction(db, async (t) => {
    const ref = doc(db, "company_orders", id),
      s = await t.get(ref);
    if (!s.exists()) throw Error("Order not found.");
    const o = { ...s.data(), id: s.id } as Row;
    if (
      !admin &&
      o.owner !== USERNAME &&
      !(o.buyer === USERNAME && next === "cancelled" && o.status === "sent")
    )
      throw Error("Only the company owner can update this order.");
    const settlement = orderSettlement(o, next);
    t.update(ref, {
      status: next,
      ...(settlement ? { escrow_released: true } : {}),
    });
    if (settlement) {
      t.update(doc(db, "users", settlement.username), {
        balance: increment(settlement.amount),
      });
      t.set(doc(collection(db, "transactions")), {
        ...settlement,
        description: "Order " + id,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
export async function claimCompartment(company: string, key: string) {
  await runTransaction(db, async (t) => {
    const ref = doc(db, "companies", company),
      s = await t.get(ref),
      c = s.data()?.compartments?.[key];
    if (!c) throw Error("Compartment not found");
    if (c.owner) throw Error("Already reserved");
    t.update(ref, { ["compartments." + key + ".owner"]: USERNAME });
  });
}
export async function townMayor(
  town: string,
  mayor: string,
  createTown = false,
) {
  await runTransaction(db, async (t) => {
    const tr = doc(db, "towns", town),
      ts = await t.get(tr),
      ur = doc(db, "users", mayor),
      us = await t.get(ur);
    if (!us.exists()) throw Error("Mayor account not found");
    if (createTown && ts.exists()) throw Error("Town already exists.");
    let old: any = null;
    if (ts.data()?.mayor && ts.data()?.mayor !== mayor)
      old = await t.get(doc(db, "users", ts.data()!.mayor));
    if (createTown)
      t.set(tr, {
        name: town,
        mayor,
        chunks: 0,
        residents: 1,
        screenshots: [],
        town_type: "Settlement",
        citizens_can_upload: false,
        banned_users: [],
      });
    else t.update(tr, { mayor });
    t.update(ur, {
      town,
      ...(!["admin", "leader", "operator"].includes(us.data()?.role)
        ? { role: "mayor" }
        : {}),
    });
    if (old?.exists() && old.data().role === "mayor")
      t.update(old.ref, { role: "citizen" });
  });
  await audit("Assigned " + mayor + " as mayor of " + town);
}
export async function friendship(other: string, action: string) {
  const b = writeBatch(db),
    a = doc(db, "users", USERNAME),
    o = doc(db, "users", other);
  if (action === "request")
    b.update(o, { friend_requests: arrayUnion(USERNAME) });
  if (action === "accept") {
    b.update(a, {
      friend_requests: arrayRemove(other),
      friends: arrayUnion(other),
    });
    b.update(o, { friends: arrayUnion(USERNAME) });
  }
  if (action === "reject") b.update(a, { friend_requests: arrayRemove(other) });
  if (action === "remove") {
    b.update(a, { friends: arrayRemove(other) });
    b.update(o, { friends: arrayRemove(USERNAME) });
  }
  await b.commit();
}
export async function materialAction(id: string, action: string) {
  await runTransaction(db, async (t) => {
    const r = doc(db, "materials", id),
      s = await t.get(r),
      m = s.data();
    if (!m) throw Error("Request missing.");
    if (action === "claim") {
      if (m.status !== "open" || m.requester === USERNAME)
        throw Error("Cannot claim this request");
      t.update(r, { status: "pending_requester", fulfilled_by: USERNAME });
    }
    if (action === "delivery") {
      if (m.status !== "pending_requester" || m.requester !== USERNAME)
        throw Error("Only requester can confirm delivery");
      t.update(r, { status: "pending_fulfiller" });
    }
    if (action === "paid") {
      if (m.status !== "pending_fulfiller" || m.fulfilled_by !== USERNAME)
        throw Error("Only fulfiller can confirm payment");
      t.update(r, { status: "fulfilled" });
      t.update(doc(db, "users", USERNAME), {
        trust_level: increment(5),
        rank_points: increment(5),
      });
    }
  });
}
export async function postChat(
  channel: string,
  content: string,
  avatar: string,
  replyTo?: string,
) {
  const user = await read("users/" + USERNAME),
    ch = await read("discord_channels/" + channel);
  if (user?.is_muted || ch?.messaging_disabled)
    throw Error("Messaging is disabled.");
  await addDoc(collection(db, "global_chat"), {
    username: USERNAME,
    content,
    avatar_url: avatar,
    channel_id: channel,
    timestamp: Date.now(),
    source: "app",
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
}
export async function orderChat(id: string, message: string) {
  await addDoc(collection(db, "company_orders", id, "chat"), {
    sender: USERNAME,
    message,
    timestamp: new Date().toISOString(),
  });
}
export async function listOnce(path: string) {
  const s = await getDocs(collection(db, path));
  return s.docs.map((d) => clean({ ...d.data(), id: d.id }));
}

export async function createJob(values: Record<string, any>) {
  const slots = Number(values.max_workers ?? 1);
  if (!Number.isInteger(slots) || slots < 1)
    throw Error("Worker slots must be a positive whole number.");
  const [user, jobs, settings] = await Promise.all([
    read("users/" + USERNAME),
    listOnce("jobs"),
    read("system/settings"),
  ]);
  if (settings?.job_board_locked) throw Error("Job board is locked.");
  if (
    jobs.filter((j) => j.posted_by === USERNAME && j.status !== "archived")
      .length >= dynamicLimit(user!, "job_publish_limit", 5)
  )
    throw Error("Your published job limit has been reached.");
  return create("jobs", {
    ...values,
    posted_by: USERNAME,
    max_workers: slots,
    status: "open",
    workers: [],
  });
}
export async function createShop(values: Record<string, any>, town: string) {
  const [user, shops] = await Promise.all([
    read("users/" + USERNAME),
    listOnce("shops"),
  ]);
  if (
    shops.filter((s) => s.owner === USERNAME).length >=
    dynamicLimit(user!, "shop_limit", 5)
  )
    throw Error("Your shop limit has been reached.");
  return create("shops", {
    ...values,
    owner: USERNAME,
    town_name: town,
    created_at: new Date().toISOString(),
    image_urls: values.image_url ? [values.image_url] : [],
  });
}
export async function buyUpgrade(type: string) {
  const price =
    type === "shop_limit" ? 50 : type === "job_publish_limit" ? 200 : 0;
  if (!price) throw Error("Unknown upgrade");
  await runTransaction(db, async (t) => {
    const r = doc(db, "users", USERNAME),
      s = await t.get(r);
    if (num(s.data()?.balance) < price) throw Error("Insufficient Emeralds.");
    t.update(r, {
      balance: increment(-price),
      active_upgrades: arrayUnion({
        type,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      }),
    });
    t.set(doc(collection(db, "transactions")), {
      username: USERNAME,
      amount: -price,
      description: "Bought " + type + " upgrade",
      type: "upgrade",
      timestamp: new Date().toISOString(),
    });
  });
}
export async function createInvite(code: string, uses: number, hours: number) {
  if (!code || code.includes("/")) throw Error("Invalid invitation code.");
  await runTransaction(db, async (t) => {
    const r = doc(db, "invites", code);
    if ((await t.get(r)).exists())
      throw Error("This invitation code already exists.");
    t.set(r, {
      code,
      created_by: USERNAME,
      status: "active",
      uses_left: uses,
      expires_at: hours > 0 ? new Date(Date.now() + hours * 3600000) : null,
    });
  });
}

// Related town records are moved in one atomic batch; refuse oversized migrations.
export async function editTown(oldName: string, values: Record<string, any>) {
  const newName = String(values.name || oldName).trim();
  if (!newName || newName.includes("/")) throw Error("Invalid town name.");
  if (oldName === newName) return patch("towns/" + oldName, values);
  const [citizens, shops] = await Promise.all([
    getDocs(query(collection(db, "users"), where("town", "==", oldName))),
    getDocs(query(collection(db, "shops"), where("town_name", "==", oldName))),
  ]);
  if (citizens.size + shops.size > 480)
    throw Error("This town needs an administrator-assisted migration.");
  await runTransaction(db, async (t) => {
    const source = doc(db, "towns", oldName),
      target = doc(db, "towns", newName),
      management = doc(db, "town_management", oldName),
      newManagement = doc(db, "town_management", newName),
      dip = doc(db, "diplomacy", "global");
    const [old, next, m, nm, d] = await Promise.all([
      t.get(source),
      t.get(target),
      t.get(management),
      t.get(newManagement),
      t.get(dip),
    ]);
    if (!old.exists()) throw Error("Town not found.");
    if (next.exists() || nm.exists())
      throw Error("That town name is already in use.");
    const refs = [...citizens.docs, ...shops.docs];
    const current = await Promise.all(refs.map((r) => t.get(r.ref)));
    t.set(target, { ...old.data(), ...values, name: newName });
    t.delete(source);
    if (m.exists()) {
      t.set(newManagement, m.data());
      t.delete(management);
    }
    current.forEach((r, i) => {
      const field = i < citizens.size ? "town" : "town_name";
      if (r.exists() && r.data()?.[field] === oldName)
        t.update(r.ref, { [field]: newName });
    });
    if (d.exists())
      t.update(dip, {
        allies: arr(d.data().allies).map((x) => (x === oldName ? newName : x)),
        enemies: arr(d.data().enemies).map((x) =>
          x === oldName ? newName : x,
        ),
      });
  });
  await audit("Renamed town " + oldName + " to " + newName);
}
export async function townRestrictions(town: string, banned: string[]) {
  if (banned.some((n) => !n || n.includes("/")))
    throw Error("Invalid username.");
  if (banned.length > 450) throw Error("Too many restrictions for one change.");
  await runTransaction(db, async (t) => {
    const ref = doc(db, "towns", town),
      s = await t.get(ref);
    if (!s.exists()) throw Error("Town missing.");
    if (banned.includes(s.data().mayor))
      throw Error("Transfer mayorship before banning the mayor.");
    const users = await Promise.all(
      banned.map((n) => t.get(doc(db, "users", n))),
    );
    t.update(ref, { banned_users: banned });
    users.forEach((u) => {
      if (u.exists() && u.data()?.town === town)
        t.update(u.ref, { town: "Nomad" });
    });
  });
  await audit("Updated town restrictions for " + town);
}
export async function buyConsulting() {
  const operators = await getDocs(
    query(collection(db, "users"), where("role", "==", "operator")),
  );
  const operator = operators.docs[0];
  if (!operator) throw Error("No operator is available.");
  await runTransaction(db, async (t) => {
    const ref = doc(db, "users", USERNAME),
      s = await t.get(ref);
    if (num(s.data()?.balance) < 1000) throw Error("Insufficient Emeralds.");
    t.update(ref, { balance: increment(-1000) });
    t.update(operator.ref, {
      notifications: arrayUnion({
        id: crypto.randomUUID(),
        message:
          USERNAME + " has paid 1000 Emeralds to request company consulting.",
        type: "consulting_request",
        timestamp: Date.now(),
        read: false,
      }),
    });
    t.set(doc(collection(db, "transactions")), {
      username: USERNAME,
      amount: -1000,
      description: "Paid for Company Consulting",
      type: "consulting",
      timestamp: new Date().toISOString(),
    });
  });
}

export async function claimTutorial() {
  await runTransaction(db, async (t) => {
    const r = doc(db, "users", USERNAME),
      s = await t.get(r);
    if (!s.exists()) throw Error("Account missing.");
    if (!s.data().tutorial_reward_claimed)
      t.update(r, { tutorial_reward_claimed: true, balance: increment(100) });
  });
}

export async function setHunter(
  username: string,
  days: number,
  permanent: boolean,
  removeEntry = false,
) {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(username))
    throw Error("Invalid Minecraft username.");
  if (
    !removeEntry &&
    !permanent &&
    (!Number.isInteger(days) || days < 1 || days > 3650)
  )
    throw Error("Enter a duration between 1 and 3650 days.");
  await runTransaction(db, async (t) => {
    const ref = doc(db, "diplomacy", "global"),
      s = await t.get(ref),
      hunters = { ...(s.data()?.hunters || {}) },
      key = username.toLowerCase();
    if (removeEntry) delete hunters[key];
    else
      hunters[key] = {
        ...hunters[key],
        username,
        permanent,
        added_at: hunters[key]?.added_at || new Date(),
        expires_at: permanent ? null : new Date(Date.now() + days * 86400000),
      };
    if (s.exists()) t.update(ref, { hunters });
    else t.set(ref, { hunters });
  });
  await audit((removeEntry ? "Removed hunter " : "Updated hunter ") + username);
}
