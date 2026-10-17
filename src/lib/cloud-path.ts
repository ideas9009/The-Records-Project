export const NATION_ID = "byzantium";
export function cloudPath(path: string) {
 const parts = path.split("/");
 if (parts.some(p => !p || ["__proto__", "constructor", "prototype"].includes(p)))
   throw new Error("Invalid record path");
 return parts[0] === "users" ? path : "nations/" + NATION_ID + "/" + path;
}
