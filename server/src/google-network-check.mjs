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
