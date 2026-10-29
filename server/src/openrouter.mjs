import { ApiError } from "./security.mjs";
export const OPENROUTER_MODEL = "deepseek/deepseek-chat";
export async function loadLegacyOpenRouterKey(fetchImpl = fetch) {
  const response = await fetchImpl("https://firestore.googleapis.com/v1/projects/the-records-project/databases/(default)/documents/config/secrets", { signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) throw Error("Legacy AI settings unavailable.");
  const data = await response.json();
  const key = data?.fields?.openrouter_api_key?.stringValue?.trim();
  if (typeof key !== "string" || !/^sk-or-[A-Za-z0-9_-]{20,}$/.test(key)) throw Error("Legacy OpenRouter key unavailable.");
  return key;
}
function schema(value) {
  if (Array.isArray(value)) return value.map(schema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "type" && typeof item === "string" ? item.toLowerCase() : schema(item)]));
}
function messages(system, contents) {
  const result = system ? [{ role: "system", content: system }] : [];
  for (const content of contents) {
    if (content.openRouterMessage) { result.push(content.openRouterMessage); continue; }
    for (const part of content.parts || []) {
      if (part.functionResponse) {
        const call = part.functionResponse;
        result.push({ role: "tool", tool_call_id: call.id || call.call_id, content: JSON.stringify(call.response) });
      }
    }
    const text = (content.parts || []).filter(part => typeof part.text === "string" && !part.thought).map(part => part.text).join("");
    if (text) result.push({ role: content.role === "model" ? "assistant" : "user", content: text });
  }
  return result;
}
export async function openRouterCompletion({ apiKey, model = OPENROUTER_MODEL, system, contents, tools = [], signal, fetchImpl = fetch, maxTokens = 4096 }) {
  const body = { model, messages: messages(system, contents), max_tokens: maxTokens };
  if (tools.length) {
    body.tools = tools.map(tool => ({ type: "function", function: { ...tool, parameters: schema(tool.parameters) } }));
    body.tool_choice = "auto";
    body.provider = { require_parameters: true };
  }
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey, "X-Title": "The Records Project" },
    body: JSON.stringify(body), signal, redirect: "error",
  });
  if (!response.ok) {
    const errors = { 400: "OpenRouter rejected the request format or model parameters.", 401: "OpenRouter rejected the server API key. Check OPENROUTER_API_KEY.", 402: "The OpenRouter key has insufficient credits or has reached its spending limit.", 403: "OpenRouter denied this request. Check the key permissions.", 404: "The configured OpenRouter model or a compatible tool provider is unavailable.", 429: "OpenRouter is busy or the key's request limit has been reached. Try again later." };
    throw new ApiError(503, errors[response.status] || "OpenRouter is temporarily unavailable. Please try again.");
  }
  let data;
  try { data = await response.json(); }
  catch (error) { if (["TimeoutError", "AbortError"].includes(error?.name)) throw error; throw new ApiError(503, "OpenRouter returned an unreadable response."); }
  const message = data?.choices?.[0]?.message;
  if (!message || message.refusal) throw new ApiError(503, "OpenRouter did not return an answer. Try rephrasing your request.");
  const parts = [];
  if (typeof message.content === "string" && message.content) parts.push({ text: message.content });
  else if (Array.isArray(message.content)) for (const part of message.content) if (part.type === "text" && typeof part.text === "string") parts.push({ text: part.text });
  for (const call of message.tool_calls || []) {
    if (call.type !== "function" || !call.id || !call.function?.name) throw new ApiError(503, "OpenRouter returned an invalid tool call.");
    let args;
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { throw new ApiError(503, "OpenRouter returned unreadable tool arguments."); }
    parts.push({ functionCall: { name: call.function.name, id: call.id, args } });
  }
  if (!parts.length) throw new ApiError(503, "OpenRouter returned no visible answer or action.");
  // Keep the complete assistant turn, including reasoning_details, for tool continuation.
  return { role: "model", parts, openRouterMessage: { ...message, role: "assistant" } };
}
