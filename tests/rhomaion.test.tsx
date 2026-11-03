import "fake-indexeddb/auto";
import { it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => platform.native,
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "rhomaion-ai" }),
}));
vi.mock("../src/lib/auth-context", () => ({
  useAuth: () => ({
    account: {
      uid: "regular",
      username: "User",
      role: "citizen",
      status: "approved",
      createdAt: "",
    },
    loading: false,
  }),
}));
import {
  rhomaionAvailable,
  aiPreferences,
  saveAiPreferences,
  defaultAiPreferences,
  type AiChat,
} from "../src/lib/rhomaion";
import { canAccessPage } from "../src/lib/access";
import {
  readAiChats,
  saveAiChat,
  deleteAiChat,
  clearAiChats,
} from "../src/lib/rhomaion-history";
import RhomaionSettings from "../src/components/RhomaionSettings";
const account = {
  uid: "regular",
  username: "User",
  role: "citizen",
  status: "approved",
  createdAt: "",
} as const;
beforeEach(() => {
  platform.native = false;
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("window", new EventTarget());
});
it("hides AI from ordinary web accounts while allowing the exact developer account and approved native accounts", () => {
  expect(rhomaionAvailable(account)).toBe(false);
  expect(canAccessPage(account, "rhomaion")).toBe(false);
  const developer = { ...account, uid: "cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67" };
  expect(rhomaionAvailable(developer)).toBe(true);
  expect(canAccessPage(developer, "rhomaion")).toBe(true);
  platform.native = true;
  expect(rhomaionAvailable(account)).toBe(true);
  expect(rhomaionAvailable({ ...account, status: "pending" })).toBe(false);
});
it("website Settings shows the Windows-only message without chat controls", () => {
  const html = renderToStaticMarkup(<RhomaionSettings />);
  expect(html).toContain("only available for the Windows app");
  expect(html).not.toContain("Export chats");
  expect(html).not.toContain("Open developer testing");
});
it("preferences are account-separated and malformed values use safe defaults", () => {
  expect(aiPreferences("one")).toEqual(defaultAiPreferences);
  saveAiPreferences("one", { ...defaultAiPreferences, saveHistory: false });
  expect(aiPreferences("one").saveHistory).toBe(false);
  expect(aiPreferences("two").saveHistory).toBe(true);
  localStorage.setItem("records-rhomaion-preferences:one", "not-json");
  expect(aiPreferences("one")).toEqual(defaultAiPreferences);
});
it("local history can only read/delete the requested account and refuses cross-account saves", async () => {
  const chat: AiChat = {
    id: "test",
    uid: "one",
    title: "Private to one",
    updatedAt: 1,
    messages: [],
  };
  await saveAiChat("one", chat);
  await saveAiChat("two", { ...chat, uid: "two", title: "Private to two" });
  expect((await readAiChats("one")).map((c) => c.title)).toEqual([
    "Private to one",
  ]);
  expect(() => saveAiChat("two", chat)).toThrow();
  await deleteAiChat("one", "test");
  expect(await readAiChats("one")).toEqual([]);
  expect((await readAiChats("two")).length).toBe(1);
  await clearAiChats("two");
  expect(await readAiChats("two")).toEqual([]);
});

it('saved player previews retain lookup identity without persisting profile stats',async()=>{const chat:AiChat={id:'privacy',uid:'privacy-test',title:'Player lookup',updatedAt:1,messages:[{id:'a',role:'assistant',text:'Found a public profile',previews:[{kind:'player',uuid:'11111111-1111-4111-8111-111111111111',name:'Example',checkedAt:'2026-11-02T00:00:00Z',record:{stats:{balance:99},town:{name:'Old town'}}}]}]};await saveAiChat(chat.uid,chat);const saved=(await readAiChats(chat.uid))[0];expect(saved.messages[0].previews?.[0].record).toEqual({});expect(chat.messages[0].previews?.[0].record.stats.balance).toBe(99);await clearAiChats(chat.uid);});
