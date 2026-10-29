import https from "node:https";
const target = "https://generativelanguage.googleapis.com/v1beta/models";
function category(error) {
  if (["AbortError", "TimeoutError"].includes(error?.name)) return "TIMEOUT";
  const code = error?.cause?.code || error?.code;
  return ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ENETUNREACH", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code) ? code : "CONNECTION_FAILED";
}
export function googleIpv4Probe(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(target, { family: 4, agent: false, signal: AbortSignal.timeout(timeoutMs) }, response => {
      // Any HTTP response proves connectivity, including the expected missing-key error.
      response.resume(); resolve(response.statusCode);
    });
    req.once("error", reject);
  });
}
export async function checkGoogleNetwork({ fetchImpl = fetch, ipv4Probe = googleIpv4Probe, timeoutMs = 8000 } = {}) {
  async function measure(run) {
    const start = Date.now();
    try { return { reached: true, httpStatus: await run(), elapsedMs: Date.now() - start }; }
    catch (error) { return { reached: false, error: category(error), elapsedMs: Date.now() - start }; }
  }
  // No API key, inference or user information is sent. Run once per server start.
  const [nodeFetch, ipv4Https] = await Promise.all([
    measure(async () => {
      const response = await fetchImpl(target, { method: "GET", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
      await response.body?.cancel(); return response.status;
    }),
    measure(() => ipv4Probe(timeoutMs)),
  ]);
  return { state: "complete", nodeFetch, ipv4Https };
}


export async function compareGoogleApis({ apiKey, model = "gemini-3.8-flash", fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const selected = /^gemini-[a-zA-Z0-9.-]+$/.test(model) ? model : "gemini-3.8-flash";
  if (!apiKey) return { state: "skipped", reason: "KEY_NOT_CONFIGURED" };
  async function run(url, body) {
    const start = Date.now();
    try {
      const response = await fetchImpl(url, {
        method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
        headers: { "x-goog-api-key": apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      // Only status and timing leave the server; no credentials, prompts or generated text.
      const status = data?.error?.status;
      const statuses = ["INVALID_ARGUMENT", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"];
      return { reached: true, httpStatus: response.status, elapsedMs: Date.now() - start,
        ...(statuses.includes(status) ? { googleStatus: status } : {}) };
    } catch (error) { return { reached: false, error: category(error), elapsedMs: Date.now() - start }; }
  }
  const base = "https://generativelanguage.googleapis.com/v1beta/";
  const [modelAccess, generateContent, interactions] = await Promise.all([
    run(base + "models/" + selected),
    run(base + "models/" + selected + ":generateContent", {
      contents: [{ role: "user", parts: [{ text: "Reply with the single word Hello." }] }],
      generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: "low" } },
    }),
    run(base + "interactions", { model: selected, input: "Reply with the single word Hello.", store: false,
      generation_config: { max_output_tokens: 512, thinking_level: "low" } }),
  ]);
  return { state: "complete", model: selected, modelAccess, generateContent, interactions };
}
