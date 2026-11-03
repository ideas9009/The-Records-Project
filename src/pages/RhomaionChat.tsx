import RhomaionSummary, { validAiPreview } from "./RhomaionSummary";
import type { AiPreview } from "../lib/rhomaion";
import type { AiDraft, AiRoute } from "../lib/ai-actions";
import { canUseDeveloperTools } from "../lib/developer-tools";
import { requestAiReply } from "../lib/rhomaion-request";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  Plus,
  History,
  Send,
  Trash2,
  ChevronLeft,
  Minus,
  X,
  Settings2,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import { external } from "../lib/native";
import {
  rhomaionAvailable,
  aiPreferences,
  RHOMAION_NAME,
  type AiChat,
  type AiMessage,
  type AiProposal,
  type AiStatus,
} from "../lib/rhomaion";
import { readAiChats, saveAiChat, deleteAiChat } from "../lib/rhomaion-history";
import "./RhomaionChat.css";
const uid = () => crypto.randomUUID();
export default function RhomaionChat({
  go,
  spotlight = false,
}: { go?: (page: string) => void; spotlight?: boolean } = {}) {
  const { account, loading } = useAuth();
  if (loading) return <div className="rhomaion-unavailable"><RhomaionWorking label="Connecting…" /></div>;
  if (!rhomaionAvailable(account))
    return (
      <div className="rhomaion-unavailable">
        <h1>{RHOMAION_NAME}</h1>
        <p>
          {account
            ? "Rhōmaíōn AI is only available for the Windows app."
            : "Sign in to the main TRP app to use Rhōmaíōn AI."}
        </p>
      </div>
    );
  return (
    <RhomaionConversation
      key={account!.uid}
      accountId={account!.uid}
      go={go}
      spotlight={spotlight}
    />
  );
}
export function RhomaionConversation({
  accountId,
  go,
  spotlight = false,
}: {
  accountId: string;
  go?: (page: string) => void;
  spotlight?: boolean;
}) {
  const [chat, setChat] = useState<AiChat>(() => ({
      id: uid(),
      uid: accountId,
      title: "New conversation",
      updatedAt: Date.now(),
      messages: [],
    })),
    [history, setHistory] = useState<AiChat[]>([]),
    [showHistory, setShowHistory] = useState(false),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("Connecting to Rhōmaíōn…"),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(""),
    [status, setStatus] = useState<AiStatus | null>(null),
    [prefs, setPrefs] = useState(() => aiPreferences(accountId)),
    [approving, setApproving] = useState<string | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [spotlightOpen, setSpotlightOpen] = useState(false),
    [selectedChat, setSelectedChat] = useState(0),
    [fullConversation, setFullConversation] = useState(false);
  const [previews,setPreviews] = useState<AiPreview[]>([]), [previewIndex,setPreviewIndex] = useState(0), [summaryOpen,setSummaryOpen] = useState(false);
  function receivePreview(item: AiPreview) {
    if (!alive.current || !validAiPreview(item)) return;
    setPreviews(items=>[item,...items.filter(p=>p.kind!==item.kind || (p.uuid!==item.uuid && p.name.toLowerCase()!==item.name.toLowerCase()))].slice(0,12));
    setPreviewIndex(0); setSummaryOpen(true);
  }
  useEffect(()=>{
    const seen=new Set<string>();
    const items=chat.messages.flatMap(message=>message.previews||[]).filter(validAiPreview).reverse().filter(item=>{const key=item.kind+item.uuid;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,12);
    setPreviews(items); setPreviewIndex(0); setSummaryOpen(items.length>0);
  },[chat.id]);
  const historyList = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null),
    composerTop = useRef<number | null>(null),
    prompt = useRef<HTMLTextAreaElement>(null);
  const choices = history
    .filter(
      (item) =>
        item.uid === accountId &&
        item.title.toLowerCase().includes(draft.trim().toLowerCase()),
    )
    .slice(0, 30);
  const alive = useRef(true),
    end = useRef<HTMLDivElement>(null),
    native =
      isTauri() &&
      ["rhomaion-ai", "rhomaion-prompt"].includes(getCurrentWindow().label);
  useEffect(() => {
    alive.current = true;
    let statusActive=true, checkingStatus=false, retryStatus=false;
    const connectStatus=async()=>{
      if(checkingStatus || !statusActive)return;
      checkingStatus=true;
      try{
        const next=await apiRequest<AiStatus>("/api/ai/status",{networkOnly:true});
        if(statusActive){setStatus(next);setError("");retryStatus=false;}
      }catch(reason){
        if(statusActive){retryStatus=true;setError(reason instanceof Error?reason.message:"Rhōmaíōn could not connect.");}
      }finally{checkingStatus=false;}
    };
    const retryOnFocus=()=>{if(retryStatus)void connectStatus();};
    void connectStatus();
    window.addEventListener('online',connectStatus);
    window.addEventListener('focus',retryOnFocus);
    void readAiChats(accountId)
      .then((items) => {
        if (alive.current) setHistory(items);
      })
      .catch((e) => alive.current && setStorageError(e.message));
    const clearVisibleHistory = () => {
      setHistory([]);
      setChat({
        id: uid(),
        uid: accountId,
        title: "New conversation",
        updatedAt: Date.now(),
        messages: [],
      });
    };
    const preferences = (event?: Event) => {
      setPrefs(aiPreferences(accountId));
      if (
        event instanceof StorageEvent &&
        event.key === "records-ai-history-cleared:" + accountId
      )
        clearVisibleHistory();
    };
    window.addEventListener("records-ai-history-cleared", clearVisibleHistory);
    window.addEventListener("storage", preferences);
    window.addEventListener("records-ai-preferences", preferences);
    return () => {
      alive.current = false;
      statusActive=false;
      window.removeEventListener("online",connectStatus);
      window.removeEventListener("focus",retryOnFocus);
      window.removeEventListener("storage", preferences);
      window.removeEventListener("records-ai-preferences", preferences);
      window.removeEventListener(
        "records-ai-history-cleared",
        clearVisibleHistory,
      );
    };
  }, [accountId]);
  useEffect(() => {
    if (!spotlight) return;
    prompt.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void invoke("quick_search_close");
      }
    };
    document.addEventListener("keydown", key, true);
    let active = true,
      stop: (() => void) | undefined;
    if (native)
      void listen("quick-search-reset", () => {
        if (busy || approving) {
          setSpotlightOpen(true);
          return;
        }
        setSpotlightOpen(false);
        setDraft("");
        setSelectedChat(0);
        void readAiChats(accountId)
          .then((items) => {
            if (active) setHistory(items);
          })
          .catch((e) => setStorageError(e.message));
        setTimeout(() => prompt.current?.focus(), 0);
      }).then((fn) => {
        if (active) stop = fn;
        else fn();
      });
    return () => {
      active = false;
      stop?.();
      document.removeEventListener("keydown", key, true);
    };
  }, [spotlight, busy, approving, accountId]);
  useEffect(() => {
    if (spotlight && native)
      void invoke("quick_search_layout", {
        expanded: spotlightOpen,
        results: !spotlightOpen,
        preview: summaryOpen,
      }).catch(() => {});
  }, [spotlight, spotlightOpen, summaryOpen]);
  useEffect(()=>{
    if(native && !spotlight && summaryOpen) void invoke('quick_search_layout',{expanded:true,results:false,preview:true}).catch(()=>{});
  },[native,spotlight,summaryOpen]);
  useEffect(() => {
    if (spotlight) setSelectedChat((n) => Math.min(n, choices.length));
  }, [spotlight, choices.length]);
  useEffect(() => {
    historyList.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedChat]);
  useLayoutEffect(() => {
    if (!spotlight || !composer.current) return;
    const top = composer.current.getBoundingClientRect().top;
    const old = composerTop.current;
    composerTop.current = top;
    if (
      old !== null &&
      Math.abs(old - top) > 2 &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      composer.current.animate(
        [
          { transform: "translateY(" + (old - top) + "px)" },
          { transform: "translateY(0)" },
        ],
        { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
  }, [spotlight, spotlightOpen, chat.id, chat.messages.length]);
  function openSaved(item: AiChat) {
    if (busy || approving || item.uid !== accountId) return;
    setChat(item);
    setSpotlightOpen(true);
    setShowHistory(false);
    setFullConversation(false);
    setDraft("");
    setError("");
    setTimeout(() => prompt.current?.focus(), 0);
  }
  function activateChoice() {
    if (selectedChat > 0 && choices[selectedChat - 1])
      openSaved(choices[selectedChat - 1]);
    else {
      setSpotlightOpen(true);
      setFullConversation(false);
      if (draft.trim()) void send(draft, false, false, true);
      else
        setChat({
          id: uid(),
          uid: accountId,
          title: "New conversation",
          messages: [],
          updatedAt: Date.now(),
        });
    }
  }
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat.messages.length, busy]);
  async function remember(next: AiChat) {
    setChat(next);
    if (!prefs.saveHistory) return;
    try {
      await saveAiChat(accountId, next);
      const items = await readAiChats(accountId);
      if (alive.current) {
        setHistory(items);
        setStorageError("");
      }
    } catch (e) {
      if (alive.current)
        setStorageError(
          e instanceof Error
            ? e.message
            : "This conversation could not be saved locally.",
        );
    }
  }
  async function navigate(page: string, draft?: AiDraft, route?: AiRoute) {
    if (native) await invoke("rhomaion_navigate", { page, draft, route });
    else if (draft || route)
      window.dispatchEvent(
        new CustomEvent("records-ai-navigate", {
          detail: { page, draft, route },
        }),
      );
    else go?.(page);
  }
  async function send(
    content: string,
    retry = false,
    diagnostic = false,
    startNew = false,
  ) {
    if (busy || !content.trim() || !status?.configured) return;
    if (spotlight) setSpotlightOpen(true);
    const baseChat = startNew
      ? {
          id: uid(),
          uid: accountId,
          title: "New conversation",
          messages: [] as AiMessage[],
          updatedAt: Date.now(),
        }
      : chat;
    setBusy(true);
    setProgress("Preparing your request…");
    setError("");
    setDraft("");
    const messages = retry
      ? baseChat.messages
      : [
          ...baseChat.messages,
          { id: uid(), role: "user" as const, text: content.trim() },
        ];
    const next = {
      ...baseChat,
      title: baseChat.messages.length
        ? baseChat.title
        : content.trim().slice(0, 45),
      messages,
      updatedAt: Date.now(),
    };
    await remember(next);
    try {
      let context: { page?: string } = {};
      if (prefs.shareContext) {
        if (native)
          context = { page: await invoke<string>("rhomaion_context") };
        else context = { page: "rhomaion" };
      }
      const recent = messages
        .slice(-24)
        .map(({ role, text }) => ({ role, text: text.slice(0, 6000) }));
      while (
        recent.length > 1 &&
        recent.reduce((n, m) => n + m.text.length, 0) > 28000
      )
        recent.shift();
      const reply = await requestAiReply(
        {
          messages: recent,
          context,
          preferences: prefs,
          ...(diagnostic ? { diagnostic: true } : {}),
        },
        () => alive.current,
        (message) => {
          if (alive.current) setProgress(message);
        },
        async (action) => {
          try {
            await navigate(action.page, action.draft, action.route);
          } catch {
            if (alive.current)
              setError("The main window could not open the requested page.");
          }
        },
        receivePreview,
      );
      if (!alive.current) return;
      await remember({
        ...next,
        messages: [
          ...messages,
          {
            id: uid(),
            role: "assistant",
            text: reply.text,
            proposals: reply.proposals,
            activity: reply.activity,
            previews: reply.previews,
          },
        ],
        updatedAt: Date.now(),
      });
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "The request could not finish.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function approval(proposal: AiProposal, approve: boolean) {
    if (approving) return;
    setApproving(proposal.id);
    setError("");
    let result: AiProposal["result"] = "failed";
    try {
      const response = await apiRequest<{ applied: boolean }>(
        "/api/ai/actions/" + encodeURIComponent(proposal.id),
        { method: "POST", body: { approve } },
      );
      result = response.applied ? "approved" : "declined";
      if (native && response.applied) await invoke("rhomaion_refresh");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The change could not be applied.",
      );
    }
    const next = {
      ...chat,
      updatedAt: Date.now(),
      messages: chat.messages.map((m) => ({
        ...m,
        proposals: m.proposals?.map((p) =>
          p.id === proposal.id ? { ...p, result } : p,
        ),
      })),
    };
    await remember(next);
    setApproving(null);
  }
  const checkConnection = () =>
    void apiRequest<AiStatus>("/api/ai/status", { networkOnly: true })
      .then((value) => {
        setStatus(value);
        setError("");
      })
      .catch((e) => setError(e.message));
  const close = () =>
    void (spotlight && native ? invoke("quick_search_close") : getCurrentWindow().close())
      .catch(() => setError("The window could not close."));
  return (
    <div className={"rhomaion-workspace"+(summaryOpen?" has-summary":"")}>
    <div
      className={"rhomaion-chat" + (spotlight ? " rhomaion-spotlight" : "")}
      data-expanded={spotlightOpen ? "true" : "false"}
      onKeyDown={(e) => {
        if (
          spotlight &&
          e.target !== prompt.current &&
          (e.key === "ArrowDown" || e.key === "ArrowUp") &&
          !busy &&
          !approving
        ) {
          e.preventDefault();
          setSpotlightOpen(false);
          setSelectedChat(
            (n) =>
              (n + (e.key === "ArrowDown" ? 1 : -1) + choices.length + 1) %
              (choices.length + 1),
          );
          prompt.current?.focus();
        }
      }}
    >
      <header className="rhomaion-window-header">
        <div
          className="rhomaion-drag"
          onMouseDown={(e) => {
            if (native && e.button === 0)
              void getCurrentWindow().startDragging();
          }}
        >
          <Sparkles size={19} />
          <div>
            <strong>{RHOMAION_NAME}</strong>
            <small>EarthMC assistant · Beta</small>
          </div>
        </div>
        <button
          aria-label="Chat history"
          title="Chat history"
          disabled={busy || !!approving}
          onClick={() => {
            if (spotlight) {
              setSpotlightOpen(false);
              setDraft("");
              setSelectedChat(0);
              prompt.current?.focus();
            } else setShowHistory((v) => !v);
          }}
        >
          <History size={17} />
        </button>
        <button
          aria-label="New conversation"
          title="New conversation"
          disabled={busy || !!approving}
          onClick={() => {
            setChat({
              id: uid(),
              uid: accountId,
              title: "New conversation",
              updatedAt: Date.now(),
              messages: [],
            });
            setShowHistory(false);
            setError("");
          }}
        >
          <Plus size={18} />
        </button>
        {native && (
          <>
            <button
              aria-label="Minimize"
              onClick={() => void getCurrentWindow().minimize()}
            >
              <Minus size={17} />
            </button>
            <button aria-label="Close" onClick={close}>
              <X size={17} />
            </button>
          </>
        )}
      </header>
      <div className="rhomaion-permissions">
        AI permissions:{" "}
        {status?.effectiveRoles
          .map((r) => r.replaceAll("_", " "))
          .join(" · ") || "Checking…"}{" "}
        · Edits need approval
      </div>
      {spotlight && !spotlightOpen ? (
        <div
          ref={historyList}
          className="rhomaion-spotlight-history"
          role="listbox"
          aria-label="Saved conversations"
        >
          <button
            type="button"
            role="option"
            aria-selected={selectedChat === 0}
            disabled={busy || !!approving}
            onClick={() => {
              setSelectedChat(0);
              setSpotlightOpen(true);
              setChat({
                id: uid(),
                uid: accountId,
                title: "New conversation",
                updatedAt: Date.now(),
                messages: [],
              });
              setTimeout(() => prompt.current?.focus(), 0);
            }}
          >
            <Plus size={16} />
            <span>
              {draft.trim() ? "Ask in a new conversation" : "New conversation"}
            </span>
          </button>
          {choices.map((item, index) => (
            <button
              type="button"
              key={item.id}
              role="option"
              aria-selected={selectedChat === index + 1}
              disabled={busy || !!approving}
              onClick={() => openSaved(item)}
            >
              <History size={16} />
              <span>{item.title}</span>
              <small>{new Date(item.updatedAt).toLocaleDateString()}</small>
            </button>
          ))}
          {!history.length && (
            <p>No saved conversations yet. Type a question to begin.</p>
          )}
        </div>
      ) : showHistory ? (
        <div className="rhomaion-history">
          <button
            className="rhomaion-text-button"
            onClick={() => setShowHistory(false)}
          >
            <ChevronLeft size={16} />
            Back to chat
          </button>
          <h2>Saved on this device</h2>
          {!history.length && <p>No saved conversations for this account.</p>}
          {history.map((item) => (
            <div className="rhomaion-history-row" key={item.id}>
              <button
                onClick={() => {
                  setChat(item);
                  setShowHistory(false);
                  setError("");
                }}
              >
                <strong>{item.title}</strong>
                <small>{new Date(item.updatedAt).toLocaleString()}</small>
              </button>
              <button
                aria-label={"Delete " + item.title}
                onClick={() => setDeleteId(item.id)}
              >
                <Trash2 size={16} />
              </button>
              {deleteId === item.id && (
                <div className="rhomaion-delete-confirm">
                  Delete this local conversation?
                  <button
                    onClick={() =>
                      void deleteAiChat(accountId, item.id)
                        .then(async () => {
                          setHistory(await readAiChats(accountId));
                          if (chat.id === item.id)
                            setChat({
                              id: uid(),
                              uid: accountId,
                              title: "New conversation",
                              updatedAt: Date.now(),
                              messages: [],
                            });
                          setDeleteId(null);
                        })
                        .catch((e) => setStorageError(e.message))
                    }
                  >
                    Delete
                  </button>
                  <button onClick={() => setDeleteId(null)}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <main
          className="rhomaion-messages"
          aria-label="Conversation"
          key={spotlight ? chat.id : undefined}
        >
          {spotlight && chat.messages.length > 2 && (
            <button
              className="rhomaion-text-button"
              onClick={() => setFullConversation((v) => !v)}
            >
              {fullConversation
                ? "Show latest exchange"
                : "Show full conversation"}
            </button>
          )}
          {!chat.messages.length && (
            <div className="rhomaion-welcome">
              <span>
                <Sparkles size={30} />
              </span>
              <h1>How can I help?</h1>
              <p>
                Explore EarthMC, plan your town’s expansion, or ask me to
                prepare a change for your approval.
              </p>
              {[
                "Which direction should my town expand?",
                "Show my town and its claim allowance.",
                "What can you help me do?",
              ].map((prompt) => (
                <button key={prompt} onClick={() => setDraft(prompt)}>
                  {prompt}
                </button>
              ))}
              <small>
                Chats can be saved locally. Messages and requested context are
                sent to{" "}
                {status?.provider === "openrouter"
                  ? "OpenRouter and its model provider"
                  : status?.provider === "gemini"
                    ? "Google Gemini"
                    : "the configured AI provider"}
                . Advice can be inaccurate.
              </small>
            </div>
          )}
          {(spotlight && !fullConversation
            ? latestTurn(chat.messages)
            : chat.messages
          ).map((message) => (
            <article
              className={"rhomaion-message " + message.role}
              key={message.id}
            >
              <span className="rhomaion-speaker">
                {message.role === "user" ? "You" : RHOMAION_NAME}
              </span>
              <div className="rhomaion-message-text">
                <ReactMarkdown
                  skipHtml
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={href?.startsWith("https://") ? href : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          if (href?.startsWith("https://")) void external(href);
                        }}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {message.text}
                </ReactMarkdown>
              </div>
              {!!message.activity?.length && (
                <details className="rhomaion-activity">
                  <summary>
                    Actions and lookups ({message.activity.length})
                  </summary>
                  {message.activity.map((a, i) => (
                    <div key={i}>
                      {a.tool.replaceAll("_", " ")} ·{" "}
                      {a.ok ? "completed" : "unavailable"}
                    </div>
                  ))}
                </details>
              )}
              {message.proposals?.map((proposal) => {
                const expired = proposal.expiresAt < Date.now(),
                  resolved = !!proposal.result;
                return (
                  <section className="rhomaion-approval" key={proposal.id}>
                    <strong>{proposal.title}</strong>
                    <p>
                      {resolved
                        ? proposal.result === "approved"
                          ? "Applied after your approval."
                          : proposal.result === "declined"
                            ? "Declined. Nothing was changed."
                            : "This proposal could not be applied. Ask for a new proposal."
                        : expired
                          ? "This proposal expired. Ask for a new one."
                          : "Review these exact changes. Nothing has been edited yet."}
                    </p>
                    <dl>
                      {proposal.changes.map((change) => (
                        <div key={change.field}>
                          <dt>{change.field}</dt>
                          <dd>
                            <del>{change.before}</del>
                            <span>→ {change.after}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {!resolved && !expired && (
                      <div>
                        <button
                          disabled={!!approving || busy}
                          onClick={() => void approval(proposal, true)}
                        >
                          Approve changes
                        </button>
                        <button
                          disabled={!!approving || busy}
                          onClick={() => void approval(proposal, false)}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
            </article>
          ))}
          {(busy || approving || (!status && !error)) && (
            <RhomaionWorking label={approving ? "Processing your approval…" : busy ? progress : "Connecting…"} />
          )}
          <div ref={end} />
        </main>
      )}
      {canUseDeveloperTools({ uid: accountId, status: "approved" }) &&
        !busy &&
        status?.configured && (
          <button
            className="rhomaion-diagnostic"
            onClick={() => void send("Test AI connection", false, true)}
          >
            Test AI connection
          </button>
        )}
      {storageError && (
        <p className="rhomaion-error" role="status">
          {storageError} The current chat remains in memory.
        </p>
      )}
      {error && (
        <div className="rhomaion-error" role="alert">
          {error}
          {chat.messages.at(-1)?.role === "user" && status?.configured && (
            <button
              disabled={busy}
              onClick={() => void send(chat.messages.at(-1)!.text, true)}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {status && !status.configured && (
        <p className="rhomaion-error">
          Rhōmaíōn is not connected yet. The app operator needs to finish the
          server setup.{" "}
          <button onClick={checkConnection}>Check connection</button>
        </p>
      )}
      <form
        ref={composer}
        className="rhomaion-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (spotlight && !spotlightOpen) activateChoice();
          else void send(draft);
        }}
      >
        <textarea
          ref={prompt}
          aria-label="Message Rhōmaíōn"
          placeholder={
            spotlight && !spotlightOpen
              ? "Ask Rhōmaíōn or search saved chats…"
              : "Ask Rhōmaíōn…"
          }
          maxLength={4000}
          value={draft}
          disabled={busy || !!approving}
          onChange={(e) => {
            setDraft(e.target.value);
            setSelectedChat(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (spotlight && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              if (!busy && !approving) {
                setSpotlightOpen(false);
                setSelectedChat(
                  (n) =>
                    (n +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      choices.length +
                      1) %
                    (choices.length + 1),
                );
              }
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={
            busy ||
            !!approving ||
            ((!spotlight || spotlightOpen || selectedChat === 0) &&
              (!draft.trim() || !status?.configured))
          }
        >
          <Send size={19} />
        </button>
      </form>
      <footer className="rhomaion-footer">
        {!summaryOpen&&previews.length>0&&<button type="button" onClick={()=>setSummaryOpen(true)}>Show summary</button>}
        {spotlight&&<span>↑ ↓ chats · Alt+Shift+Q · Esc close</span>}
        <span>
          {prefs.saveHistory ? "History saved locally" : "History saving off"} ·{" "}
          {prefs.shareContext ? "Page context on" : "Page context off"}
        </span>
        <button
          title="AI settings"
          aria-label="AI settings"
          onClick={() => void navigate("settings:ai")}
        >
          <Settings2 size={14} />
        </button>
      </footer>
    </div>
    {summaryOpen&&<RhomaionSummary items={previews} index={previewIndex} onSelect={setPreviewIndex} onClose={()=>setSummaryOpen(false)}/>}
    </div>
  );
}

export function latestTurn(messages: AiMessage[]): AiMessage[] {
  let index = messages.length - 1;
  while (index >= 0 && messages[index].role !== "user") index--;
  return index >= 0 ? messages.slice(index) : messages.slice(-1);
}

function RhomaionWorking({label}:{label:string}) {
 return <div className="rhomaion-thinking" role="status" aria-live="polite" aria-atomic="true">
  <span className="rhomaion-working-star" aria-hidden="true"><Sparkles size={18}/></span>
  <div className="rhomaion-working-copy"><strong>Rhōmaíōn is working</strong><span key={label}>{label}</span></div>
  <span className="rhomaion-working-wave" aria-hidden="true"><i/><i/><i/></span>
 </div>;
}
