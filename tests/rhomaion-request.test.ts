import { beforeEach, expect, test, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/lib/api", () => ({ apiRequest: api }));
import { requestAiReply } from "../src/lib/rhomaion-request";
beforeEach(() => api.mockReset());
test("waits for a background reply without resubmitting the message", async () => {
  const reply = { text: "Hello", navigation: [], proposals: [], activity: [], model: "test" };
  api.mockResolvedValueOnce({ requestId: "request-id", state: "pending" })
    .mockResolvedValueOnce({ state: "pending" }).mockResolvedValueOnce({ state: "complete", reply });
  const progress = vi.fn();
  expect(await requestAiReply({ messages: [{ role: "user", text: "Hello" }] }, () => true, progress)).toEqual(reply);
  expect(api).toHaveBeenCalledTimes(3);
  expect(api.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  expect(progress).toHaveBeenCalledWith("Rhōmaíōn is still preparing a reply…");
});
test("stops checking when the window closes", async () => {
  api.mockResolvedValueOnce({ requestId: "request-id", state: "pending" });
  await expect(requestAiReply({}, () => false, vi.fn())).rejects.toThrow("window was closed");
  expect(api).toHaveBeenCalledTimes(1);
});
test("preserves meaningful server errors", async () => {
  api.mockResolvedValueOnce({ requestId: "request-id", state: "pending" }).mockRejectedValueOnce(Error("Google denied API access"));
  await expect(requestAiReply({}, () => true, vi.fn())).rejects.toThrow("Google denied API access");
});


test("opens a town before the final explanation and never repeats the navigation", async () => {
 const navigation = [{ page: "town:theodoulopolis" }];
 const reply = { text: "Town opened.", navigation, proposals: [], activity: [], model: "test" };
 api.mockResolvedValueOnce({ requestId: "request-id", state: "pending" })
  .mockResolvedValueOnce({ state: "pending", version: 4, progress: { phase: "model", round: 2, navigation } })
  .mockResolvedValueOnce({ state: "complete", reply });
 const navigate = vi.fn().mockResolvedValue(undefined), progress = vi.fn();
 await requestAiReply({}, () => true, progress, navigate);
 expect(navigate).toHaveBeenCalledExactlyOnceWith({page:"town:theodoulopolis"});
 expect(progress).toHaveBeenCalledWith("Waiting for Rhōmaíōn’s follow-up (step 2)…");
 expect(api.mock.calls[2][0]).toContain("?after=4");
});

test("delivers completed navigation even if the follow-up model request fails", async () => {
 api.mockResolvedValueOnce({ requestId: "request-id", state: "pending" })
  .mockResolvedValueOnce({ state: "pending", version: 4, progress: { phase: "model", round: 2, navigation: [{ page: "town:theodoulopolis" }] } })
  .mockRejectedValueOnce(Error("Rhōmaíōn timed out (RAI_TIMEOUT)"));
 const navigate = vi.fn().mockResolvedValue(undefined);
 await expect(requestAiReply({}, () => true, vi.fn(), navigate)).rejects.toThrow("RAI_TIMEOUT");
 expect(navigate).toHaveBeenCalledExactlyOnceWith({page:"town:theodoulopolis"});
});


test('delivers side summaries once, before the final explanation and independently of navigation',async()=>{
 const previews=[{kind:'player' as const,uuid:'11111111-1111-4111-8111-111111111111',name:'Example',checkedAt:'2026-11-02T00:00:00Z',record:{name:'Example'}}];
 api.mockResolvedValueOnce({requestId:'test'}).mockResolvedValueOnce({state:'pending',version:1,progress:{phase:'tool_complete',previews}}).mockResolvedValueOnce({state:'complete',reply:{text:'Profile found',previews,navigation:[],proposals:[],activity:[],model:'test'}});
 const preview=vi.fn(),navigate=vi.fn();await requestAiReply({},()=>true,vi.fn(),navigate,preview);expect(preview).toHaveBeenCalledExactlyOnceWith(previews[0]);expect(navigate).not.toHaveBeenCalled();
});
