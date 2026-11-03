import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useAuth } from "../lib/auth-context";
import { canUseDeveloperTools } from "../lib/developer-tools";
import { apiRequest } from "../lib/api";
import {
  aiPreferences,
  saveAiPreferences,
  openRhomaion,
  RHOMAION_NAME,
  type AiStatus,
  type AiPreferences,
} from "../lib/rhomaion";
import { clearAiChats, readAiChats } from "../lib/rhomaion-history";
export default function RhomaionSettings({
  go,
}: {
  go?: (page: string) => void;
}) {
  const { account } = useAuth(),
    native = isTauri(),
    dev = canUseDeveloperTools(account);
  const [prefs, setPrefs] = useState(() => aiPreferences(account?.uid || "")),
    [status, setStatus] = useState<AiStatus | null>(null),
    [error, setError] = useState(""),
    [confirmClear, setConfirmClear] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!account) return;
    setPrefs(aiPreferences(account.uid));
    if (native || dev)
      void apiRequest<AiStatus>("/api/ai/status", { networkOnly: true })
        .then(setStatus)
        .catch((e) => setError(e.message));
  }, [account?.uid, native, dev]);
  function change(next: AiPreferences) {
    if (!account) return;
    try {
      saveAiPreferences(account.uid, next);
      setPrefs(next);
      setMessage("Preferences saved on this device.");
    } catch {
      setError("Preferences could not be saved.");
    }
  }
  async function exportChats() {
    if (!account) return;
    try {
      const chats = await readAiChats(account.uid);
      if (native) {
        const result = await invoke<string>("rhomaion_export", {
          contents: JSON.stringify(
            { app: RHOMAION_NAME, exportedAt: new Date().toISOString(), chats },
            null,
            2,
          ),
        });
        setMessage(result);
        return;
      }
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                app: RHOMAION_NAME,
                exportedAt: new Date().toISOString(),
                chats,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "Rhomaion-chats-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage("Local chat export requested.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export chats.");
    }
  }
  if (!native)
    return (
      <section className="card setting-card">
        <h2>{RHOMAION_NAME}</h2>
        <p>Rhōmaíōn AI is only available for the Windows app.</p>
        {dev && (
          <button onClick={() => go?.("rhomaion")}>
            Open developer testing
          </button>
        )}
      </section>
    );
  return (
    <div className="widget-settings">
      <section className="card setting-card">
        <h2>{RHOMAION_NAME}</h2>
        <p>
          An AI assistant for EarthMC and TRP. It can read permitted
          information and navigate the app. Edits always require your approval.
        </p>
        <p>
          AI permissions: {status?.effectiveRoles.join(", ") || "Checking…"}.
          Operator access is capped at Admin.
        </p>
        <button
          disabled={account?.status !== "approved"}
          onClick={() =>
            account &&
            void openRhomaion(account.uid).catch((e) => setError(String(e)))
          }
        >
          Open {RHOMAION_NAME}
        </button>
        {status && !status.configured && (
          <p>
            AI is not connected yet.
            {dev
              ? " Check the AI provider key in Render’s server environment."
              : " Please contact the app operator."}
          </p>
        )}
        {status?.configured && <p>Connected model: {status.model}</p>}
      </section>
      <section className="card setting-card">
        <h2>Conversation preferences</h2>
        <label className="widget-setting-check">
          <input
            type="checkbox"
            checked={prefs.shareContext}
            onChange={(e) =>
              change({ ...prefs, shareContext: e.target.checked })
            }
          />
          <span>
            Share the current page
            <small>
              Send the page name so Rhōmaíōn knows what you are viewing. It
              retrieves additional data through permitted tools.
            </small>
          </span>
        </label>
        <label className="widget-setting-check">
          <input
            type="checkbox"
            checked={prefs.keepOnTop}
            onChange={(e) => change({ ...prefs, keepOnTop: e.target.checked })}
          />
          <span>
            Keep the AI window on top
            <small>
              Applies the next time you open or focus it using the topbar.
            </small>
          </span>
        </label>
        <label className="widget-setting-check">
          <span>Response style</span>
          <select
            value={prefs.style}
            onChange={(e) =>
              change({
                ...prefs,
                style: e.target.value as AiPreferences["style"],
              })
            }
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </section>
      <section className="card setting-card">
        <h2>Local chat history</h2>
        <label className="widget-setting-check">
          <input
            type="checkbox"
            checked={prefs.saveHistory}
            onChange={(e) =>
              change({ ...prefs, saveHistory: e.target.checked })
            }
          />
          <span>
            Save conversations on this device
            <small>
              History is separated by TRP account. Switching this off stops
              future saves; existing chats remain until deleted.
            </small>
          </span>
        </label>
        <p>
          Prompts, replies and tool context are sent to {status?.provider === "openrouter" ? "OpenRouter and its model provider" : status?.provider === "gemini" ? "Google Gemini" : "the configured AI provider"} to answer
          your requests. Saving locally does not make AI processing offline.
        </p>
        <div className="widget-lock-actions">
          <button onClick={() => void exportChats()}>Export chats</button>
          <button onClick={() => setConfirmClear(true)}>
            Clear local chats
          </button>
        </div>
        {confirmClear && (
          <div>
            <p>Delete all locally saved conversations for this TRP account?</p>
            <button
              onClick={() =>
                account &&
                void clearAiChats(account.uid)
                  .then(() => {
                    localStorage.setItem(
                      "records-ai-history-cleared:" + account.uid,
                      String(Date.now()),
                    );
                    setConfirmClear(false);
                    setMessage("Local conversations deleted.");
                    window.dispatchEvent(
                      new Event("records-ai-history-cleared"),
                    );
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Delete local chats
            </button>
            <button onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        )}
      </section>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="card" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
