import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
const key = JSON.parse(await readFile(process.argv[2], "utf8"));
initializeApp({ credential: cert(key) });
const db = getFirestore(),
  uid = "cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67";
await db.runTransaction(async (tx) => {
  const ref = db.doc("users/" + uid),
    snap = await tx.get(ref);
  if (
    !snap.exists ||
    snap.data().username !== "Sumeitideas" ||
    snap.data().role !== "operator"
  )
    throw Error("Operator account did not match.");
  const before = snap.data();
  if (before.roles?.includes("minister") && before.roles?.includes("mayor"))
    return;
  tx.set(db.doc("server_migration_backups/roles-v2-operator"), before);
  tx.update(ref, {
    roles: [
      ...new Set([
        ...(before.roles || ["operator"]),
        "operator",
        "minister",
        "mayor",
      ]),
    ],
  });
  tx.set(db.collection("nations/byzantium/audit").doc(), {
    actor: "Sumeitideas",
    actorUid: uid,
    action: "roles.upgraded",
    target: "Sumeitideas",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});
const towns = await db.collection("nations/byzantium/towns").get();
for (const town of towns.docs) {
  const name = town.data().name.trim().replace(/\s+/g, " ").toLowerCase(),
    ref = db.doc(
      "nations/byzantium/town_names/" + Buffer.from(name).toString("base64url"),
    );
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) tx.set(ref, { id: town.id });
  });
}
console.log("Operator roles updated; existing town names reserved.");
