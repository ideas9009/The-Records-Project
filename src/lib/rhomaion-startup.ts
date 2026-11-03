import { getCurrentWindow } from "@tauri-apps/api/window";

export function showRhomaionStartupError(reason: unknown) {
  console.error("Rhomaion window startup failed", reason);
  const root = document.getElementById("root");
  if (!root) return;
  const panel = document.createElement("section");
  panel.style.cssText = "padding:28px;color:#eef0f6;background:#17191f;font:14px/1.6 Segoe UI,sans-serif;min-height:100vh;box-sizing:border-box";
  const heading = document.createElement("h1");
  heading.textContent = "Rhōmaíōn AI couldn’t open";
  const message = document.createElement("p");
  message.textContent = "The chat interface could not load. Try again, or close this window and reopen it from the main app.";
  const retry = document.createElement("button");
  retry.textContent = "Try again";
  retry.onclick = () => location.reload();
  const close = document.createElement("button");
  close.textContent = "Close window";
  close.onclick = () => void getCurrentWindow().close().catch(console.error);
  for (const button of [retry, close]) button.style.cssText = "margin:8px 8px 0 0;padding:10px 16px;border:1px solid #ffffff30;border-radius:10px;background:#ffffff12;color:inherit;cursor:pointer";
  panel.append(heading, message, retry, close);
  root.replaceChildren(panel);
}
