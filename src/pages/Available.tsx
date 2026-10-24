import { startBackgroundPolling } from "../lib/background-polling";
import { useEffect, useRef, useState } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import MinecraftFace from "../components/MinecraftFace";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { SyncStatus } from "../components/SmartSync";
import { LoadingStatus, Spinner } from "../components/Loading";
import {
  type Availability,
  type HiringInbox,
  type HiringConversation,
  type HiringMessage,
  payRange,
  payPeriods,
} from "../lib/hiring";
import "./Available.css";
type Go = (page: string) => void;
const Icon = ({ name }: { name: string }) => (
  <span className="material-symbol" aria-hidden="true">
    {name}
  </span>
);
const reason = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request failed. Please try again.";
const when = (date: string) =>
  new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setLoading(true);
    setData(null);
    return watchResource<T>(
      path,
      (value) => {
        setData(value);
        setLoading(false);
        setError("");
      },
      (error) => {
        setError(error.message);
        setLoading(false);
      },
    );
  }, [path]);
  return { data, loading, error };
}
function useGuard(dirty: boolean, busy: boolean, back: () => void) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null),
    current = useRef({ dirty, busy }),
    pending = useRef(back);
  current.current = { dirty, busy };
  const leave = (element: HTMLElement, proceed = back) => {
    if (busy) return;
    if (!dirty) {
      proceed();
      return;
    }
    pending.current = proceed;
    setAnchor(element);
  };
  useEffect(() => {
    const guard = (event: Event) => {
      if (!current.current.dirty && !current.current.busy) return;
      event.preventDefault();
      if (current.current.busy) return;
      const nav = event as CustomEvent<{
        proceed: () => void;
        anchor: HTMLElement;
      }>;
      pending.current = nav.detail.proceed;
      setAnchor(nav.detail.anchor || (document.activeElement as HTMLElement));
    };
    window.addEventListener("records-navigate", guard);
    return () => window.removeEventListener("records-navigate", guard);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return {
    allow: () => {
      current.current = { dirty: false, busy: false };
    },
    leave,
    confirmation: (
      <ExpandingConfirmation
        anchor={anchor}
        title="Discard unsaved changes?"
        message="Your changes have not been saved."
        triggerLabel="Back"
        triggerIcon="arrow_back"
        confirmText="Discard changes"
        onCancel={() => setAnchor(null)}
        onConfirm={() => {
          setAnchor(null);
          current.current = { dirty: false, busy: false };
          pending.current();
        }}
      />
    ),
  };
}
export function HiringNotice({ go, page }: { go: Go; page: string }) {
  const { account } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (account?.status !== "approved") {
      setUnread(0);
      return;
    }
    setUnread(0);
    let active = true;
    const load = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const items = await apiRequest<HiringInbox[]>("/api/hiring/inbox");
        if (active)
          setUnread(items.filter((item) => item.lastSeq > item.readSeq).length);
      } catch {}
    };
    const stopPolling = startBackgroundPolling(load);
    window.addEventListener("hiring-updated", load);
    return () => {
      active = false;
      stopPolling();
      window.removeEventListener("hiring-updated", load);
    };
  }, [account?.uid, account?.status]);
  if (!unread || page.startsWith("jobs:chat:") || page === "jobs:inbox")
    return null;
  return (
    <button className="card hiring-notice" onClick={() => go("jobs:inbox")}>
      <Icon name="chat" />
      {unread} hiring {unread === 1 ? "conversation has" : "conversations have"}{" "}
      unread messages
      <Icon name="arrow_forward" />
    </button>
  );
}
export default function Available({ go }: { go: Go }) {
  const { account } = useAuth();
  const { data, loading, error } =
    useResource<Availability[]>("/api/availability");
  const inbox = useResource<HiringInbox[]>("/api/hiring/inbox");
  const [search, setSearch] = useState(""),
    [period, setPeriod] = useState("all");
  const items = (data || []).filter(
    (item) =>
      (period === "all" || item.period === period) &&
      [item.username, item.title, item.description]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const unread = (inbox.data || []).filter(
    (item) => item.lastSeq > item.readSeq,
  ).length;
  return (
    <>
      <div className="board-toolbar">
        <label className="board-search">
          <Icon name="search" />
          <input
            aria-label="Search available people"
            placeholder="Search people or skills"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Pay period filter"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option value="all">All pay periods</option>
          {Object.entries(payPeriods).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button onClick={() => go("jobs:inbox")}>
          <Icon name="chat" />
          Hiring inbox
          {unread > 0 && <span className="badge">{unread} unread</span>}
        </button>
      </div>
      {loading && <LoadingStatus>Loading available people...</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      <SyncStatus path="/api/availability" />
      <div className="availability-feed">
        {items.map((item) => (
          <article className="card availability-card" key={item.id}>
            <div className="availability-person">
              <MinecraftFace username={item.username} />
              <div>
                <h2>{item.title}</h2>
                <p>
                  {item.username}
                  {item.ownerUid === account?.uid ? " (You)" : ""}
                </p>
              </div>
            </div>
            <p className="availability-description">{item.description}</p>
            <strong>{payRange(item)}</strong>
            <button
              className="board-primary"
              onClick={() =>
                go(
                  item.ownerUid === account?.uid
                    ? "jobs:availability:edit"
                    : "jobs:hire:" + item.id,
                )
              }
            >
              <Icon
                name={item.ownerUid === account?.uid ? "edit" : "handshake"}
              />
              {item.ownerUid === account?.uid ? "Edit availability" : "Hire"}
            </button>
          </article>
        ))}
      </div>
      {!loading && !error && !items.length && (
        <section className="card board-empty">
          <Icon name="person_search" />
          <h2>
            {search ? "No matching people" : "No availability listings yet"}
          </h2>
          <p>
            Let others know what work you can help with and your expected Gold
            range.
          </p>
          <button onClick={() => go("jobs:availability:edit")}>
            Set my availability
          </button>
        </section>
      )}
    </>
  );
}
export function AvailabilityEditor({ go }: { go: Go }) {
  const loaded = useResource<Availability>("/api/availability/mine");
  // A new account legitimately has no existing listing.
  if (loaded.loading)
    return <LoadingStatus>Loading your availability...</LoadingStatus>;
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  return <AvailabilityForm initial={loaded.data} go={go} />;
}
function AvailabilityForm({
  initial,
  go,
}: {
  initial: Availability | null;
  go: Go;
}) {
  const [title, setTitle] = useState(initial?.title || ""),
    [description, setDescription] = useState(initial?.description || ""),
    [min, setMin] = useState(initial ? String(initial.minGold) : ""),
    [max, setMax] = useState(initial ? String(initial.maxGold) : ""),
    [period, setPeriod] = useState<Availability["period"]>(
      initial?.period || "daily",
    ),
    [active, setActive] = useState(initial?.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const signature = JSON.stringify([
      title,
      description,
      min,
      max,
      period,
      active,
    ]),
    original = useRef(signature);
  const bypass = useRef(false);
  const guard = useGuard(
    !bypass.current && signature !== original.current,
    busy,
    () => go("jobs:available"),
  );
  return (
    <div className="task-board">
      <header className="board-editor-header page-banner">
        <button onClick={(event) => guard.leave(event.currentTarget)}>
          <Icon name="arrow_back" />
          Available
        </button>
        <h1>My availability</h1>
      </header>
      <form
        className="card board-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await apiRequest("/api/availability/mine", {
              method: "PUT",
              body: {
                title,
                description,
                minGold: Number(min),
                maxGold: Number(max),
                period,
                active,
                version: initial?.version || 0,
              },
            });
            bypass.current = true;
            original.current = signature;
            guard.allow();
            go("jobs:available");
          } catch (error) {
            setError(reason(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          What can you help with?
          <input
            required
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
            placeholder="Building farms, gathering materials..."
          />
        </label>
        <label>
          About your availability
          <textarea
            required
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
            placeholder="Your skills, usual hours and any useful details"
          />
        </label>
        <div className="availability-pay">
          <label>
            Minimum Gold
            <input
              required
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              value={min}
              onChange={(event) => setMin(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Maximum Gold
            <input
              required
              type="number"
              min={min || 0}
              max="1000000000"
              step="0.01"
              value={max}
              onChange={(event) => setMax(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Pay period
            <select
              value={period}
              onChange={(event) =>
                setPeriod(event.target.value as Availability["period"])
              }
              disabled={busy}
            >
              {Object.entries(payPeriods).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="availability-toggle">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            disabled={busy}
          />
          Show me as available
        </label>
        <p>
          Turn this off when you are no longer looking for work. Existing hiring
          conversations remain available.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="board-actions">
          <button
            type="button"
            disabled={busy}
            onClick={(event) => guard.leave(event.currentTarget)}
          >
            Cancel
          </button>
          <button className="board-primary" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}Save availability
          </button>
        </div>
      </form>
      {guard.confirmation}
    </div>
  );
}
export function HirePerson({ id, go }: { id: string; go: Go }) {
  const { data, loading, error } = useResource<Availability>(
    "/api/availability/" + id,
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const clientId = useRef(crypto.randomUUID()),
    bypass = useRef(false);
  const guard = useGuard(!bypass.current && !!message, busy, () =>
    go("jobs:available"),
  );
  return (
    <div className="task-board">
      <header className="board-editor-header page-banner">
        <button onClick={(event) => guard.leave(event.currentTarget)}>
          <Icon name="arrow_back" />
          Available
        </button>
        <h1>Hire {data?.username || "a member"}</h1>
      </header>
      {loading && <LoadingStatus>Loading availability...</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <form
          className="card board-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setFailure("");
            try {
              const thread = await apiRequest<{ id: string }>(
                "/api/availability/" + id + "/hire",
                {
                  method: "POST",
                  body: { message, clientId: clientId.current },
                },
              );
              bypass.current = true;
              setMessage("");
              guard.allow();
              go("jobs:chat:" + thread.id);
            } catch (error) {
              setFailure(reason(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{data.title}</h2>
          <p>{data.description}</p>
          <strong>{payRange(data)}</strong>
          <label>
            Your hiring message
            <textarea
              required
              maxLength={3000}
              rows={5}
              disabled={busy}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the job, where it is and the pay you would like to discuss."
            />
          </label>
          <p>
            This starts a private conversation between you and {data.username}.
          </p>
          {failure && <p role="alert">{failure}</p>}
          <button className="board-primary" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            <Icon name="send" />
            Send hiring request
          </button>
        </form>
      )}
      {guard.confirmation}
    </div>
  );
}
export function HiringInboxPage({ go }: { go: Go }) {
  const { data, loading, error } =
    useResource<HiringInbox[]>("/api/hiring/inbox");
  return (
    <div className="task-board">
      <header className="board-editor-header page-banner">
        <button onClick={() => go("jobs:available")}>
          <Icon name="arrow_back" />
          Available
        </button>
        <h1>Hiring inbox</h1>
      </header>
      {loading && <LoadingStatus>Loading conversations...</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      {data?.map((item) => (
        <button
          key={item.id}
          className="card hiring-inbox-row"
          onClick={() => go("jobs:chat:" + item.id)}
        >
          <MinecraftFace username={item.otherName} />
          <div>
            <h2>
              {item.otherName}
              {item.lastSeq > item.readSeq && (
                <span className="badge">Unread</span>
              )}
            </h2>
            <p>{item.listingTitle}</p>
            <p>{item.lastMessage}</p>
            <time>{when(item.updatedAt)}</time>
          </div>
          <Icon name="arrow_forward" />
        </button>
      ))}
      {!loading && !error && !data?.length && (
        <section className="card board-empty">
          <Icon name="chat" />
          <h2>No hiring conversations yet</h2>
          <p>Hiring requests and replies will appear here.</p>
        </section>
      )}
    </div>
  );
}
export function HiringChat({ id, go }: { id: string; go: Go }) {
  const { account } = useAuth();
  const [data, setData] = useState<HiringConversation | null>(null),
    [messages, setMessages] = useState<HiringMessage[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [older, setOlder] = useState(false),
    [hasEarlier, setHasEarlier] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    latest = useRef(0),
    acknowledged = useRef(0),
    requestId = useRef(crypto.randomUUID()),
    textSent = useRef(""),
    generation = useRef(0);
  const guard = useGuard(!!text, sending, () => go("jobs:inbox"));
  const load = async () => {
    const epoch = generation.current;
    const result = await apiRequest<HiringConversation>("/api/hiring/" + id);
    if (epoch !== generation.current) return;
    setData(result);
    setHasEarlier((current) => (latest.current ? current : result.hasEarlier));
    setMessages((current) => {
      const map = new Map(current.map((item) => [item.seq, item]));
      result.messages.forEach((item) => map.set(item.seq, item));
      return [...map.values()].sort((a, b) => a.seq - b.seq);
    });
    if (result.thread.lastSeq > latest.current) {
      latest.current = result.thread.lastSeq;
      requestAnimationFrame(() => {
        const node = scroll.current;
        if (node) node.scrollTop = node.scrollHeight;
      });
    }
    if (
      result.thread.lastSeq > acknowledged.current &&
      document.visibilityState === "visible"
    ) {
      await apiRequest("/api/hiring/" + id + "/read", {
        method: "POST",
        body: { seq: result.thread.lastSeq },
      });
      acknowledged.current = result.thread.lastSeq;
      window.dispatchEvent(new Event("hiring-updated"));
    }
    setError("");
    setLoading(false);
  };
  useEffect(() => {
    let active = true,
      busy = false;
    const refresh = async () => {
      if (busy || !active || document.visibilityState !== "visible") return;
      busy = true;
      try {
        await load();
      } catch (error) {
        if (active) {
          setError(reason(error));
          setLoading(false);
        }
      } finally {
        busy = false;
      }
    };
    const stopPolling = startBackgroundPolling(refresh);
    return () => {
      active = false;
      generation.current++;
      stopPolling();
    };
  }, [id]);
  const other =
    data?.thread.workerUid === account?.uid
      ? data?.thread.employerName
      : data?.thread.workerName;
  return (
    <div className="task-board hiring-chat">
      <header className="board-editor-header page-banner">
        <button onClick={(event) => guard.leave(event.currentTarget)}>
          <Icon name="arrow_back" />
          Hiring inbox
        </button>
        <h1>{other || "Hiring conversation"}</h1>
        <button onClick={()=>void load().catch(error=>setError(reason(error)))}><Icon name="refresh"/>Refresh messages</button>
      </header>
      {loading && <LoadingStatus>Loading conversation...</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <section className="card hiring-context">
            <h2>{data.thread.listingTitle}</h2>
            <p>{payRange(data.thread)} - advertised range</p>
            <p>
              Private conversation between {data.thread.workerName} and{" "}
              {data.thread.employerName}. Agree the work and payment here; Gold
              is exchanged in EarthMC.
            </p>
          </section>
          <section
            className="card hiring-messages"
            ref={scroll}
            aria-label="Conversation messages"
            tabIndex={0}
          >
            {hasEarlier && (
              <button
                disabled={older}
                onClick={async () => {
                  setOlder(true);
                  try {
                    const previous = await apiRequest<HiringConversation>(
                      "/api/hiring/" + id + "?before=" + messages[0].seq,
                    );
                    setMessages((current) => [
                      ...previous.messages,
                      ...current,
                    ]);
                    setHasEarlier(previous.hasEarlier);
                  } catch (error) {
                    setError(reason(error));
                  } finally {
                    setOlder(false);
                  }
                }}
              >
                {older && <Spinner />}Load earlier messages
              </button>
            )}
            <div role="log" aria-live="polite" aria-relevant="additions">
              {messages.map((message) => (
                <article
                  className={
                    "hiring-message " +
                    (message.senderUid === account?.uid ? "mine" : "")
                  }
                  key={message.seq}
                >
                  <strong>{message.senderName}</strong>
                  <p>{message.text}</p>
                  <time>{when(message.createdAt)}</time>
                </article>
              ))}
            </div>
          </section>
          <form
            className="card hiring-composer"
            onSubmit={async (event) => {
              event.preventDefault();
              if (sending || !text.trim()) return;
              setSending(true);
              setError("");
              if (textSent.current !== text) {
                requestId.current = crypto.randomUUID();
                textSent.current = text;
              }
              try {
                await apiRequest("/api/hiring/" + id + "/messages", {
                  method: "POST",
                  body: { message: text, clientId: requestId.current },
                });
                setText("");
                textSent.current = "";
                await load();
              } catch (error) {
                setError(reason(error));
              } finally {
                setSending(false);
              }
            }}
          >
            <label>
              Message
              <textarea
                aria-label="Message"
                required
                maxLength={3000}
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={sending}
              />
            </label>
            <button
              className="board-primary"
              disabled={sending || !text.trim()}
              aria-busy={sending}
            >
              {sending && <Spinner />}
              <Icon name="send" />
              Send
            </button>
          </form>
        </>
      )}
      {guard.confirmation}
    </div>
  );
}
