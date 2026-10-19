import Available, {
  AvailabilityEditor,
  HirePerson,
  HiringInboxPage,
  HiringChat,
} from "./Available";
import { SyncStatus } from "../components/SmartSync";
import BoardPageSlider from "../components/BoardPageSlider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Spinner, LoadingStatus } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { prepareTownPhoto } from "../lib/town-gallery";
import {
  boardStatus,
  goldLabel,
  isArchived,
  parseMaterials,
  type BoardKind,
  type BoardListing,
  type BoardDetail,
  type BoardOffer,
} from "../lib/task-board";
import "./TaskBoard.css";
const Icon = ({ name }: { name: string }) => (
  <span className="material-symbol" aria-hidden="true">
    {name}
  </span>
);
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
type Go = (page: string) => void;
function Action({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || busy} aria-busy={busy}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}
function Status({ listing }: { listing: BoardListing }) {
  return (
    <span className={"board-status status-" + listing.status}>
      {boardStatus[listing.status]}
    </span>
  );
}
function Materials({ listing }: { listing: BoardListing }) {
  return (
    <ul className="board-materials">
      {listing.materials.map((item, index) => (
        <li key={index}>
          <strong>{item.quantity.toLocaleString()}x</strong> {item.name}
        </li>
      ))}
    </ul>
  );
}
export default function TaskBoard({ page, go }: { page: string; go: Go }) {
  const { account } = useAuth();
  if (!account || account.status !== "approved")
    return (
      <section className="card">
        <h1>Task Board</h1>
        <p>Registration approval is required.</p>
      </section>
    );
  if (page === "jobs:availability:edit") return <AvailabilityEditor go={go} />;
  if (page === "jobs:inbox") return <HiringInboxPage go={go} />;
  if (page.startsWith("jobs:hire:"))
    return <HirePerson key={page} id={page.slice(10)} go={go} />;
  if (page.startsWith("jobs:chat:"))
    return <HiringChat key={page} id={page.slice(10)} go={go} />;
  if (page.startsWith("jobs:item:"))
    return <BoardDetails key={page} id={page.slice(10)} go={go} />;
  if (page.startsWith("jobs:new:"))
    return (
      <BoardEditor
        key={page}
        kind={page.endsWith("materials") ? "materials" : "task"}
        go={go}
      />
    );
  const tab =
    page === "jobs:materials"
      ? "materials"
      : page === "jobs:available"
        ? "available"
        : "task";
  return (
    <div className="task-board">
      <header className="board-heading board-topbar">
        <h1>Task Board</h1>
        <BoardPageSlider selected={tab} go={go} />
        <div className="board-publish-slot">
          {tab === "available" ? (
            <button
              className="board-primary"
              onClick={() => go("jobs:availability:edit")}
            >
              <Icon name="add" />
              My availability
            </button>
          ) : (
            <button
              className="board-primary"
              onClick={() => go("jobs:new:" + tab)}
            >
              <Icon name="add" />
              {tab === "task" ? "Publish Task" : "Request Materials"}
            </button>
          )}
        </div>
      </header>
      {tab === "available" ? (
        <Available go={go} />
      ) : (
        <BoardFeed key={tab} kind={tab} go={go} />
      )}
    </div>
  );
}
function BoardFeed({ kind, go }: { kind: BoardKind; go: Go }) {
  const { account } = useAuth();
  const [items, setItems] = useState<BoardListing[]>([]),
    [search, setSearch] = useState(""),
    [scope, setScope] = useState("all"),
    [stage, setStage] = useState("open"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setLoading(true);
    return watchResource<BoardListing[]>(
      "/api/task-board",
      (data) => {
        setItems(data);
        setError("");
        setLoading(false);
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [refresh]);
  const filtered = items.filter(
    (item) =>
      item.kind === kind &&
      (stage === "all" ||
        (stage === "archived"
          ? isArchived(item)
          : stage === "open"
            ? item.status === "open"
            : !isArchived(item) && item.status !== "open")) &&
      (scope === "all" ||
        (scope === "mine"
          ? item.ownerUid === account?.uid
          : item.assigneeUid === account?.uid)) &&
      [
        item.title,
        item.description,
        item.ownerName,
        ...item.materials.map((material) => material.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  return (
    <>
      <div className="board-toolbar">
        <label className="board-search">
          <Icon name="search" />
          <input
            aria-label={
              kind === "task" ? "Search tasks" : "Search material requests"
            }
            placeholder={
              kind === "task" ? "Search tasks" : "Search material requests"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Listing status"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          <option value="open">Open</option>
          <option value="active">In progress</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </select>
        <select
          aria-label="Listing ownership"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="all">Everyone</option>
          <option value="mine">My listings</option>
          <option value="work">My work</option>
        </select>
        <Action
          aria-label="Refresh Task Board"
          busy={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Icon name="refresh" />
        </Action>
      </div>
      {loading && (
        <LoadingStatus>
          Loading {kind === "task" ? "tasks" : "material requests"}...
        </LoadingStatus>
      )}
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      <SyncStatus path="/api/task-board" />
      <div className="board-feed">
        {filtered.map((item) => (
          <button
            key={item.id}
            className="card board-listing"
            onClick={() => go("jobs:item:" + item.id)}
            aria-label={"Open " + item.title}
          >
            <div className="board-listing-title">
              <h2>{item.title}</h2>
              <Status listing={item} />
            </div>
            <p>
              {item.description ||
                item.materials
                  .map((material) => material.quantity + "x " + material.name)
                  .join(", ")}
            </p>
            <div className="board-listing-meta">
              <span>
                <Icon name="person" />
                {item.ownerName}
              </span>
              {item.deadline && (
                <span>
                  <Icon name="schedule" />
                  {date(item.deadline)}
                </span>
              )}
              {item.kind === "task" && (
                <span>
                  <Icon
                    name={item.approvalRequired ? "how_to_reg" : "person_add"}
                  />
                  {item.approvalRequired ? "Approval required" : "Open joining"}
                </span>
              )}
              <strong className="board-gold">
                {goldLabel(item.agreedGold ?? item.priceGold)}
              </strong>
              <Icon name="arrow_forward" />
            </div>
          </button>
        ))}
      </div>
      {!loading && !error && !filtered.length && (
        <section className="card board-empty">
          <Icon name={kind === "task" ? "checklist" : "inventory_2"} />
          <h2>
            {search
              ? "No matching listings"
              : "No " +
                (stage === "archived" ? "archived " : "") +
                (kind === "task" ? "tasks" : "material requests")}
          </h2>
        </section>
      )}
    </>
  );
}
function BoardEditor({ kind, go }: { kind: BoardKind; go: Go }) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [materials, setMaterials] = useState(""),
    [price, setPrice] = useState(""),
    [deadline, setDeadline] = useState(""),
    [approval, setApproval] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const back = () => go(kind === "task" ? "jobs" : "jobs:materials");
  const unsaved = useRef(false),
    saving = useRef(false),
    pendingNavigation = useRef<null | (() => void)>(null);
  const dirty = !!(
    title ||
    description ||
    materials ||
    price ||
    deadline ||
    (kind === "task" && !approval)
  );
  unsaved.current = dirty;
  useEffect(() => {
    const guard = (event: Event) => {
      if (saving.current) {
        event.preventDefault();
        return;
      }
      if (!unsaved.current) return;
      const navigation = event as CustomEvent<{
        proceed: () => void;
        anchor?: HTMLElement | null;
      }>;
      event.preventDefault();
      pendingNavigation.current = navigation.detail?.proceed || null;
      setAnchor(
        navigation.detail?.anchor ||
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null),
      );
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
  function keepEditing() {
    pendingNavigation.current = null;
    setAnchor(null);
  }
  function discard() {
    const proceed = pendingNavigation.current;
    pendingNavigation.current = null;
    unsaved.current = false;
    setAnchor(null);
    proceed?.();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<BoardDetail>("/api/task-board", {
        method: "POST",
        body: {
          kind,
          title,
          description,
          materials: kind === "materials" ? parseMaterials(materials) : [],
          priceGold: Number(price),
          deadline: deadline ? new Date(deadline).toISOString() : null,
          approvalRequired: approval,
        },
      });
      unsaved.current = false;
      saving.current = false;
      go("jobs:item:" + result.id);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="task-board">
      <header className="board-editor-header">
        <button className="board-back" disabled={busy} onClick={back}>
          <Icon name="arrow_back" />
          Task Board
        </button>
        <h1>{kind === "task" ? "Publish Task" : "Request Materials"}</h1>
      </header>
      <form className="card board-form" onSubmit={submit}>
        <label>
          Title
          <input
            required
            maxLength={100}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          {kind === "task" ? "Task details" : "Details (optional)"}
          <textarea
            required={kind === "task"}
            maxLength={6000}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {kind === "materials" && (
          <label>
            Materials
            <textarea
              required
              rows={5}
              placeholder={"64x Spruce Logs\n32x Birch Logs"}
              value={materials}
              onChange={(event) => setMaterials(event.target.value)}
            />
          </label>
        )}
        <div className="board-form-columns">
          <label>
            {kind === "task"
              ? "Reward (EarthMC Gold)"
              : "Total budget (EarthMC Gold)"}
            <input
              required
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label>
            Deadline (optional)
            <input
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>
        </div>
        {kind === "task" && (
          <fieldset>
            <legend>Joining</legend>
            <label className="board-radio">
              <input
                type="radio"
                name="joining"
                checked={approval}
                onChange={() => setApproval(true)}
              />
              Approve applicants
            </label>
            <label className="board-radio">
              <input
                type="radio"
                name="joining"
                checked={!approval}
                onChange={() => setApproval(false)}
              />
              Anyone can join
            </label>
          </fieldset>
        )}
        <p className="board-muted">
          Payments are made in EarthMC. TRP records completion and payment
          confirmations.
        </p>
        {error && (
          <p className="board-error" role="alert">
            {error}
          </p>
        )}
        <div className="board-actions">
          <Action type="submit" className="board-primary" busy={busy}>
            <Icon name="add" />
            {kind === "task" ? "Publish Task" : "Publish Request"}
          </Action>
          <button type="button" disabled={busy} onClick={back}>
            Cancel
          </button>
        </div>
      </form>
      <ExpandingConfirmation
        anchor={anchor}
        title="Discard unsaved changes?"
        message="Your listing has not been published."
        triggerLabel={
          anchor?.querySelector(".nav-label")?.textContent ||
          anchor?.getAttribute("aria-label") ||
          anchor?.textContent?.replace(/arrow_back|north_east/g, "").trim() ||
          "Task Board"
        }
        triggerIcon={
          anchor?.querySelector(".material-symbol")?.textContent || "arrow_back"
        }
        confirmText="Discard changes"
        onConfirm={discard}
        onCancel={keepEditing}
      />
    </div>
  );
}

function BoardDetails({ id, go }: { id: string; go: Go }) {
  const { account } = useAuth();
  const [item, setItem] = useState<BoardDetail | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [confirm, setConfirm] = useState<{
      anchor: HTMLElement;
      action: string;
      title: string;
      message: string;
      body: Record<string, unknown>;
    } | null>(null);
  useEffect(() => {
    setLoading(true);
    return watchResource<BoardDetail>(
      "/api/task-board/" + id,
      (data) => {
        setItem(data);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [id, refresh]);
  async function act(action: string, body: Record<string, unknown> = {}) {
    if (!item || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<BoardDetail>(
        "/api/task-board/" + id + "/actions",
        { method: "POST", body: { ...body, action, version: item.version } },
      );
      setItem(result);
      setConfirm(null);
    } catch (reason) {
      setError(errorText(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }
  const perform = (action: string, body: Record<string, unknown> = {}) =>
    void act(action, body).catch(() => {});
  function ask(
    event: React.MouseEvent<HTMLButtonElement>,
    action: string,
    title: string,
    message: string,
    body: Record<string, unknown> = {},
  ) {
    setConfirm({ anchor: event.currentTarget, action, title, message, body });
  }
  const owner = account?.uid === item?.ownerUid,
    worker = account?.uid === item?.assigneeUid;
  return (
    <div className="task-board">
      <div className="board-heading">
        <button
          className="board-back"
          onClick={() =>
            go(item?.kind === "materials" ? "jobs:materials" : "jobs")
          }
        >
          <Icon name="arrow_back" />
          {item?.kind === "materials" ? "Material Requests" : "Tasks"}
        </button>
        <Action
          aria-label="Refresh listing"
          busy={loading}
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Icon name="refresh" />
        </Action>
      </div>
      {loading && <LoadingStatus>Loading listing...</LoadingStatus>}
      {error && !confirm && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      {item && (
        <>
          <header className="card board-detail-header">
            <div>
              <Status listing={item} />
              <h1>{item.title}</h1>
              <p className="board-muted">Published by {item.ownerName}</p>
            </div>
            <strong className="board-reward">
              {goldLabel(item.agreedGold ?? item.priceGold)}
            </strong>
          </header>
          <div className="board-detail-grid">
            <section className="card board-info">
              <h2>
                {item.kind === "task" ? "Task details" : "Requested materials"}
              </h2>
              {item.description && (
                <p className="board-description">{item.description}</p>
              )}
              {item.kind === "materials" && <Materials listing={item} />}
              <dl>
                <div>
                  <dt>Published</dt>
                  <dd>{date(item.createdAt)}</dd>
                </div>
                {item.deadline && (
                  <div>
                    <dt>Deadline</dt>
                    <dd>{date(item.deadline)}</dd>
                  </div>
                )}
                {item.kind === "task" && (
                  <div>
                    <dt>Joining</dt>
                    <dd>
                      {item.approvalRequired
                        ? "Publisher approval"
                        : "Anyone can join"}
                    </dd>
                  </div>
                )}
                {item.assigneeName && (
                  <div>
                    <dt>{item.kind === "task" ? "Worker" : "Supplier"}</dt>
                    <dd>{item.assigneeName}</dd>
                  </div>
                )}
                {item.completedAt && (
                  <div>
                    <dt>Completed</dt>
                    <dd>{date(item.completedAt)}</dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="card board-workflow">
              <h2>{isArchived(item) ? "Archive" : "Progress"}</h2>
              <ol className="board-steps">
                {[
                  "Assigned",
                  item.kind === "task"
                    ? "Proof submitted"
                    : "Delivery submitted",
                  "Publisher approved",
                  "Payment confirmed",
                ].map((label, index) => (
                  <li
                    key={label}
                    className={
                      index <
                      [
                        "open",
                        "assigned",
                        "submitted",
                        "awaiting_payment",
                        "completed",
                      ].indexOf(item.status)
                        ? "done"
                        : ""
                    }
                  >
                    <Icon
                      name={
                        index <
                        [
                          "open",
                          "assigned",
                          "submitted",
                          "awaiting_payment",
                          "completed",
                        ].indexOf(item.status)
                          ? "check_circle"
                          : "radio_button_unchecked"
                      }
                    />
                    {label}
                  </li>
                ))}
              </ol>
              {isArchived(item) && (
                <p>
                  {item.status === "completed"
                    ? "Completed and archived. Payment receipt confirmed by " +
                      item.assigneeName +
                      "."
                    : "This listing was cancelled."}
                </p>
              )}
              {item.status === "open" &&
                !owner &&
                (item.kind === "task" && item.approvalRequired ? (
                  item.applications.some(
                    (application) => application.uid === account?.uid,
                  ) ? (
                    <p>Application submitted. Awaiting publisher approval.</p>
                  ) : (
                    <NoteAction
                      label="Apply for Task"
                      field="Application note (optional)"
                      maxLength={1000}
                      busy={busy}
                      onSubmit={(message) => act("apply", { message })}
                    />
                  )
                ) : (
                  <Action
                    className="board-primary"
                    busy={busy}
                    onClick={(event) =>
                      ask(
                        event,
                        "join",
                        item.kind === "task"
                          ? "Join this task?"
                          : "Provide these materials?",
                        "You will be assigned for " +
                          goldLabel(item.priceGold) +
                          ".",
                      )
                    }
                  >
                    {item.kind === "task" ? "Join Task" : "Provide Materials"}
                  </Action>
                ))}
              {item.status === "open" && owner && (
                <>
                  <p>
                    {item.approvalRequired
                      ? "Approve an applicant to assign this task."
                      : "Waiting for someone to join."}
                  </p>
                  <Action
                    busy={busy}
                    onClick={(event) =>
                      ask(
                        event,
                        "cancel",
                        "Cancel this listing?",
                        "It will be moved to the archive.",
                      )
                    }
                  >
                    Cancel Listing
                  </Action>
                </>
              )}
              {item.status === "assigned" && !worker && (
                <p>
                  {owner
                    ? "Waiting for " +
                      item.assigneeName +
                      " to submit " +
                      (item.kind === "task"
                        ? "completion proof."
                        : "delivery confirmation.")
                    : "Assigned to " + item.assigneeName + "."}
                </p>
              )}
              {item.status === "submitted" && !owner && (
                <p>
                  Waiting for the publisher to review{" "}
                  {item.kind === "task"
                    ? "the completion proof."
                    : "the delivery."}
                </p>
              )}
              {item.status === "awaiting_payment" && (
                <>
                  <p>
                    {owner
                      ? "Send " +
                        goldLabel(item.agreedGold ?? item.priceGold) +
                        " to " +
                        item.assigneeName +
                        " in EarthMC."
                      : worker
                        ? "Confirm only after receiving " +
                          goldLabel(item.agreedGold ?? item.priceGold) +
                          " in EarthMC."
                        : "Waiting for payment confirmation."}
                  </p>
                  {worker && (
                    <Action
                      className="board-primary"
                      busy={busy}
                      onClick={(event) =>
                        ask(
                          event,
                          "payment_received",
                          "Confirm payment received?",
                          "Confirm that you received " +
                            goldLabel(item.agreedGold ?? item.priceGold) +
                            ". This completes and archives the listing.",
                        )
                      }
                    >
                      Confirm Payment Received
                    </Action>
                  )}
                </>
              )}
            </section>
          </div>
          {item.reviewNote && (
            <section className="card">
              <h2>Changes requested</h2>
              <p className="board-description">{item.reviewNote}</p>
            </section>
          )}
          {item.status === "open" &&
            item.kind === "task" &&
            owner &&
            item.approvalRequired && (
              <section className="card">
                <h2>Applicants</h2>
                {!item.applications.length && (
                  <p className="board-muted">No applications yet.</p>
                )}
                {item.applications.map((application) => (
                  <div className="board-person-row" key={application.uid}>
                    <div>
                      <strong>{application.username}</strong>
                      {application.message && <p>{application.message}</p>}
                    </div>
                    <Action
                      busy={busy}
                      onClick={(event) =>
                        ask(
                          event,
                          "approve_applicant",
                          "Assign this applicant?",
                          application.username +
                            " will be assigned for " +
                            goldLabel(item.priceGold) +
                            ".",
                          { candidateUid: application.uid },
                        )
                      }
                    >
                      Approve
                    </Action>
                  </div>
                ))}
              </section>
            )}
          {item.status === "open" && item.kind === "materials" && (
            <section className="card">
              <h2>Price negotiation</h2>
              {!owner && (
                <PriceForm
                  key={item.offers[0]?.version || 0}
                  price={item.offers[0]?.priceGold ?? item.priceGold}
                  label="Send Offer"
                  busy={busy}
                  onSubmit={(priceGold, message) =>
                    act("offer", { priceGold, message })
                  }
                />
              )}{" "}
              {owner && !item.offers.length && (
                <p className="board-muted">No offers yet.</p>
              )}
              {item.offers.map((offer) => (
                <Offer
                  key={offer.uid + ":" + offer.version}
                  offer={offer}
                  owner={owner}
                  ownerUid={item.ownerUid}
                  actorUid={account!.uid}
                  busy={busy}
                  onCounter={(priceGold, message) =>
                    act("counter_offer", {
                      candidateUid: offer.uid,
                      offerVersion: offer.version,
                      priceGold,
                      message,
                    })
                  }
                  onAccept={(event) =>
                    ask(
                      event,
                      "accept_offer",
                      "Accept this price?",
                      offer.username +
                        " will provide the materials for " +
                        goldLabel(offer.priceGold) +
                        ".",
                      { candidateUid: offer.uid, offerVersion: offer.version },
                    )
                  }
                  onDecline={() =>
                    perform("decline_offer", {
                      candidateUid: offer.uid,
                      offerVersion: offer.version,
                    })
                  }
                />
              ))}
            </section>
          )}
          {item.proof && (
            <section className="card board-proof">
              <h2>
                {item.kind === "task"
                  ? "Completion proof"
                  : "Delivery confirmation"}
              </h2>
              <p className="board-muted">
                {item.proof.submittedName} - {date(item.proof.submittedAt)}
              </p>
              {item.proof.message && (
                <p className="board-description">{item.proof.message}</p>
              )}
              {item.proof.image && (
                <img
                  src={item.proof.image}
                  alt="Submitted completion screenshot"
                />
              )}
            </section>
          )}
          {item.status === "assigned" && worker && (
            <section className="card">
              <h2>
                {item.kind === "task"
                  ? "Submit completion"
                  : "Confirm delivery"}
              </h2>
              <ProofForm
                key={item.version}
                task={item.kind === "task"}
                busy={busy}
                onSubmit={(image, message) => act("submit", { image, message })}
              />
            </section>
          )}
          {item.status === "submitted" && owner && (
            <section className="card">
              <h2>Review {item.kind === "task" ? "completion" : "delivery"}</h2>
              <div className="board-actions">
                <Action
                  className="board-primary"
                  busy={busy}
                  onClick={(event) =>
                    ask(
                      event,
                      "approve_completion",
                      "Approve completion?",
                      "Confirm the work or materials meet your request. Payment receipt will be confirmed separately by the worker.",
                    )
                  }
                >
                  Approve {item.kind === "task" ? "Completion" : "Delivery"}
                </Action>
              </div>
              <NoteAction
                label="Request Changes"
                field="Required changes"
                required
                busy={busy}
                onSubmit={(message) => act("request_changes", { message })}
              />
            </section>
          )}
        </>
      )}
      <ExpandingConfirmation
        anchor={confirm?.anchor || null}
        title={confirm?.title || "Confirm"}
        message={confirm?.message || ""}
        triggerLabel="Confirm"
        confirmText="Confirm"
        busy={busy}
        error={error}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && perform(confirm.action, confirm.body)}
      />
    </div>
  );
}

function NoteAction({
  label,
  field,
  required = false,
  maxLength = 2000,
  busy,
  onSubmit,
}: {
  label: string;
  field: string;
  required?: boolean;
  maxLength?: number;
  busy: boolean;
  onSubmit: (message: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      className="board-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(note)
          .then(() => setNote(""))
          .catch(() => {});
      }}
    >
      <label>
        {field}
        <textarea
          rows={2}
          maxLength={maxLength}
          required={required}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <Action type="submit" busy={busy}>
        {label}
      </Action>
    </form>
  );
}
function PriceForm({
  price,
  label,
  busy,
  onSubmit,
}: {
  price: number;
  label: string;
  busy: boolean;
  onSubmit: (price: number, message: string) => Promise<void>;
}) {
  const [value, setValue] = useState(String(price)),
    [note, setNote] = useState("");
  return (
    <form
      className="board-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(Number(value), note).catch(() => {});
      }}
    >
      <div className="board-form-columns">
        <label>
          Offer (EarthMC Gold)
          <input
            type="number"
            required
            min={0}
            max={1000000000}
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label>
          Note (optional)
          <input
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <Action type="submit" busy={busy}>
        {label}
      </Action>
    </form>
  );
}
function Offer({
  offer,
  owner,
  ownerUid,
  actorUid,
  busy,
  onCounter,
  onAccept,
  onDecline,
}: {
  offer: BoardOffer;
  owner: boolean;
  ownerUid: string;
  actorUid: string;
  busy: boolean;
  onCounter: (price: number, message: string) => Promise<void>;
  onAccept: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDecline: () => void;
}) {
  return (
    <article className="board-offer">
      <div className="board-listing-title">
        <h3>{offer.username}</h3>
        <strong className="board-gold">{goldLabel(offer.priceGold)}</strong>
      </div>
      <p className="board-muted">
        {offer.status === "declined"
          ? "Declined"
          : offer.lastBy === ownerUid
            ? "Publisher counteroffer"
            : "Supplier offer"}
      </p>
      {offer.message && <p>{offer.message}</p>}
      {offer.status === "pending" && (
        <>
          <div className="board-actions">
            {offer.lastBy !== actorUid && (
              <Action className="board-primary" busy={busy} onClick={onAccept}>
                Accept Offer
              </Action>
            )}
            <Action busy={busy} onClick={onDecline}>
              Decline
            </Action>
          </div>
          {owner && (
            <details>
              <summary>Counteroffer</summary>
              <PriceForm
                price={offer.priceGold}
                label="Send Counteroffer"
                busy={busy}
                onSubmit={onCounter}
              />
            </details>
          )}
        </>
      )}
    </article>
  );
}
function ProofForm({
  task,
  busy,
  onSubmit,
}: {
  task: boolean;
  busy: boolean;
  onSubmit: (image: string, message: string) => Promise<void>;
}) {
  const [image, setImage] = useState(""),
    [note, setNote] = useState(""),
    [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="board-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (task && !image) {
          setError("Attach a completion screenshot.");
          return;
        }
        void onSubmit(image, note).catch(() => {});
      }}
    >
      <label>
        {task ? "Completion screenshot" : "Delivery screenshot (optional)"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={preparing || busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setImage("");
            setError("");
            setPreparing(true);
            try {
              setImage(await prepareTownPhoto(file));
            } catch (reason) {
              setError(errorText(reason));
            } finally {
              setPreparing(false);
            }
          }}
        />
      </label>
      {preparing && <LoadingStatus>Preparing image...</LoadingStatus>}
      {image && (
        <img
          className="board-proof-preview"
          src={image}
          alt="Completion screenshot preview"
        />
      )}
      <label>
        {task ? "Completion note (optional)" : "Delivery details"}
        <textarea
          rows={3}
          required={!task}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      <Action type="submit" className="board-primary" busy={busy || preparing}>
        Submit {task ? "Completion" : "Delivery"}
      </Action>
    </form>
  );
}
