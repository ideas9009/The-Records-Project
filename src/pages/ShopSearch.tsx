import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  shopTypes,
  type ShopListing,
  townSpawnCommand,
  bulkMailCommand,
  copyShopCommand,
} from "../lib/shop-search";
import { useShopGuard } from "../lib/shop-guard";
import BoardPageSlider from "../components/BoardPageSlider";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { LoadingStatus, Spinner } from "../components/Loading";
import { SyncStatus } from "../components/SmartSync";
import "./TaskBoard.css";
import "./ShopSearch.css";
const pages = [
  { key: "shop", label: "Shops", route: "shops" },
  { key: "bulk", label: "Bulk", route: "shops:bulk" },
];
const Icon = ({ name }: { name: string }) => (
  <span className="material-symbol" aria-hidden="true">
    {name}
  </span>
);
const reason = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
function useListing(path: string) {
  const [data, setData] = useState<ShopListing | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
    return watchResource<ShopListing>(path, setData, (e) =>
      setError(e.message),
    );
  }, [path]);
  return { data, error };
}
function CopyCommand({ command, label }: { command: string; label: string }) {
  const [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="shop-copy">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await copyShopCommand(command);
            setCopied(true);
          } catch {
            setError(
              "Could not copy. Select the command below and copy it manually.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <Icon name={copied ? "check" : "content_copy"} />}{" "}
        {copied ? "Copied" : label}
      </button>
      <code>{command}</code>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function ShopSearch({
  page,
  go,
}: {
  page: string;
  go: (p: string) => void;
}) {
  if (page.startsWith("shops:new:"))
    return (
      <Editor
        key={page}
        kind={page.endsWith(":bulk") ? "bulk" : "shop"}
        go={go}
      />
    );
  if (page.startsWith("shops:edit:"))
    return <EditLoader key={page} id={page.slice(11)} go={go} />;
  if (page.startsWith("shops:item:"))
    return <Details key={page} id={page.slice(11)} go={go} />;
  return <Directory kind={page === "shops:bulk" ? "bulk" : "shop"} go={go} />;
}
function Directory({
  kind,
  go,
}: {
  kind: "shop" | "bulk";
  go: (p: string) => void;
}) {
  const { account } = useAuth(),
    [list, setList] = useState<ShopListing[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [mine, setMine] = useState(false);
  useEffect(
    () =>
      watchResource<ShopListing[]>(
        "/api/shop-search",
        (v) => {
          setList(v);
          setLoading(false);
          setError("");
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        },
      ),
    [],
  );
  const approved = account?.status === "approved",
    rows = list.filter(
      (v) =>
        v.kind === kind &&
        (!mine || v.ownerUid === account?.uid) &&
        (kind === "bulk" || type === "all" || v.shopType === type) &&
        [v.title, v.town, v.username, ...v.items]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  return (
    <div className="task-board shop-search">
      <header className="board-heading page-banner">
        <h1>Shop Search</h1>
        <BoardPageSlider
          selected={kind}
          pages={pages}
          label="Shop Search pages"
          go={go}
        />
        <div className="shop-publish">
          {approved && (
            <button
              className="board-primary"
              onClick={() => go("shops:new:" + kind)}
            >
              <Icon name="add" />
              {kind === "shop" ? "Publish Shop" : "Sell in Bulk"}
            </button>
          )}
        </div>
      </header>
      <p className="shop-intro">
        {kind === "shop"
          ? "Find shops, explore their shelves and travel to their town."
          : "Find bulk materials for sale and contact the seller in Minecraft."}
      </p>
      <div className="board-toolbar">
        <label className="board-search">
          <Icon name="search" />
          <input
            aria-label="Search shops and items"
            placeholder={
              kind === "shop"
                ? "Search shops, items or towns"
                : "Search bulk items, sellers or towns"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {kind === "shop" && (
          <select
            aria-label="Shop type filter"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All shop types</option>
            {Object.entries(shopTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        )}
        {approved && (
          <label className="shop-mine">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
            />
            My listings
          </label>
        )}
      </div>
      <SyncStatus path="/api/shop-search" />
      {loading && <LoadingStatus>Loading listings...</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      <div className="board-feed">
        {rows.map((v) => (
          <article className="card shop-listing" key={v.id}>
            <div className="board-listing-title">
              <button
                className="shop-title"
                disabled={!approved}
                onClick={() => go("shops:item:" + v.id)}
              >
                <h2>{v.title}</h2>
                {approved && <Icon name="arrow_forward" />}
              </button>
              <span className="shop-tag">
                {!v.active
                  ? kind === "bulk"
                    ? "Sold"
                    : "Closed"
                  : v.shopType
                    ? shopTypes[v.shopType]
                    : v.priceGold !== null
                      ? v.priceGold + " Gold"
                      : "Price on enquiry"}
              </span>
            </div>
            <p className="shop-meta">
              {v.town} &middot; Posted by {v.username}
            </p>
            <ul>
              {v.items.slice(0, 6).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {v.items.length > 6 && <p>+{v.items.length - 6} more items</p>}
            {v.description && <p>{v.description}</p>}
            <CopyCommand
              command={townSpawnCommand(v.town)}
              label="Copy town spawn"
            />
            {kind === "bulk" && (
              <CopyCommand
                command={bulkMailCommand(v)}
                label="Copy interest mail"
              />
            )}
          </article>
        ))}
      </div>
      {!loading && !error && !rows.length && (
        <div className="card">
          <h2>
            {mine
              ? "No matching listings of yours"
              : kind === "shop"
                ? "No shops found"
                : "No bulk listings found"}
          </h2>
          <p>
            Try another search
            {approved ? " or publish the first listing." : "."}
          </p>
        </div>
      )}
      {!approved && (
        <p>
          Once your registration is approved, you can open and publish listings.
        </p>
      )}
    </div>
  );
}
function EditLoader({ id, go }: { id: string; go: (p: string) => void }) {
  const { data, error } = useListing("/api/shop-search/" + id),
    { account } = useAuth();
  return error ? (
    <p role="alert">{error}</p>
  ) : !data ? (
    <LoadingStatus>Loading listing...</LoadingStatus>
  ) : data.ownerUid !== account?.uid ? (
    <p>Only the poster can edit this listing.</p>
  ) : (
    <Editor kind={data.kind} initial={data} go={go} />
  );
}
function Editor({
  kind,
  initial,
  go,
}: {
  kind: "shop" | "bulk";
  initial?: ShopListing;
  go: (p: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title || ""),
    [town, setTown] = useState(initial?.town || ""),
    [items, setItems] = useState(initial?.items.join("\n") || ""),
    [shopType, setShopType] = useState(initial?.shopType || "stall"),
    [description, setDescription] = useState(initial?.description || ""),
    [price, setPrice] = useState(initial?.priceGold?.toString() || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const original = JSON.stringify([
      initial?.title || "",
      initial?.town || "",
      initial?.items.join("\n") || "",
      initial?.shopType || "stall",
      initial?.description || "",
      initial?.priceGold?.toString() || "",
    ]),
    dirty =
      JSON.stringify([title, town, items, shopType, description, price]) !==
      original,
    back = () =>
      go(
        initial
          ? "shops:item:" + initial.id
          : kind === "shop"
            ? "shops"
            : "shops:bulk",
      ),
    guard = useShopGuard(dirty, busy, back);
  return (
    <div className="task-board shop-search">
      <header className="shop-editor-heading page-banner">
        <button disabled={busy} onClick={(e) => guard.leave(e.currentTarget)}>
          <Icon name="arrow_back" />
          Shop Search
        </button>
        <h1>
          {initial
            ? "Edit listing"
            : kind === "shop"
              ? "Publish Shop"
              : "Sell in Bulk"}
        </h1>
      </header>
      <form
        className="card shop-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const result = await apiRequest<ShopListing>(
              "/api/shop-search" + (initial ? "/" + initial.id : ""),
              {
                method: initial ? "PUT" : "POST",
                body: {
                  kind,
                  title,
                  town,
                  items: items
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                  shopType,
                  description,
                  priceGold: price === "" ? null : Number(price),
                  version: initial?.version,
                },
              },
            );
            guard.allow();
            go("shops:item:" + result.id);
          } catch (e) {
            setError(reason(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            {kind === "shop" ? "Shop name" : "Listing title"}
            <input
              required
              maxLength={90}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {kind === "shop" ? "Town name" : "Pickup town"}
            <input
              required
              maxLength={80}
              value={town}
              onChange={(e) => setTown(e.target.value)}
              placeholder="Town name as used in Minecraft"
            />
          </label>
          <p className="shop-hint">
            This town does not need to be registered on TRP. Visitors can copy{" "}
            {townSpawnCommand(town || "TownName")}.
          </p>
          {kind === "shop" && (
            <label>
              What type of shop?
              <select
                value={shopType}
                onChange={(e) =>
                  setShopType(e.target.value as keyof typeof shopTypes)
                }
              >
                {Object.entries(shopTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {kind === "shop" ? "Items available" : "Bulk items for sale"}
            <textarea
              required
              rows={6}
              maxLength={12100}
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder={
                kind === "shop"
                  ? "One item per line, including quantities or prices if helpful"
                  : "Double chest of stone\n64x Spruce Logs"
              }
            />
          </label>
          <p className="shop-hint">
            One item per line. Up to 100 items, 120 characters each.
          </p>
          {kind === "bulk" && (
            <label>
              Asking price in EarthMC Gold (optional)
              <input
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          )}
          <label>
            {kind === "shop"
              ? "Description and directions (optional)"
              : "Pickup details (optional)"}
            <textarea
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="board-toolbar">
          <button className="board-primary" disabled={busy}>
            {busy ? <Spinner /> : <Icon name="publish" />}
            {initial ? "Save changes" : "Publish"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => guard.leave(e.currentTarget)}
          >
            Cancel
          </button>
        </div>
        <p className="shop-hint">
          Arrange collection and payment in Minecraft. Keep your listing up to
          date.
        </p>
      </form>
      {guard.confirmation}
    </div>
  );
}
function Details({ id, go }: { id: string; go: (p: string) => void }) {
  const { data, error } = useListing("/api/shop-search/" + id),
    { account } = useAuth(),
    [updated, setUpdated] = useState<ShopListing | null>(null),
    [anchor, setAnchor] = useState<HTMLElement | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const v = updated || data;
  return (
    <div className="task-board shop-search">
      <header className="board-heading page-banner">
        <button onClick={() => go(v?.kind === "bulk" ? "shops:bulk" : "shops")}>
          <Icon name="arrow_back" />
          Shop Search
        </button>
        {v && v.ownerUid === account?.uid && (
          <div className="board-toolbar">
            <button onClick={() => go("shops:edit:" + id)}>
              <Icon name="edit" />
              Edit
            </button>
            <button
              onClick={(e) => {
                setActionError("");
                setAnchor(e.currentTarget);
              }}
            >
              {v.active
                ? v.kind === "bulk"
                  ? "Mark as sold"
                  : "Close shop"
                : "Reopen listing"}
            </button>
          </div>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      {!v && !error && <LoadingStatus>Loading listing...</LoadingStatus>}
      {v && (
        <>
          <SyncStatus path={"/api/shop-search/" + id} />
          <article className="card shop-article">
            <span className="shop-tag">
              {!v.active
                ? v.kind === "bulk"
                  ? "Sold"
                  : "Closed"
                : v.shopType
                  ? shopTypes[v.shopType]
                  : "Bulk sale"}
            </span>
            <h1>{v.title}</h1>
            <p className="shop-meta">
              {v.town} &middot; Posted by {v.username}
            </p>
            {v.kind === "bulk" && (
              <p>
                {v.priceGold === null
                  ? "Price on enquiry"
                  : v.priceGold + " EarthMC Gold"}
              </p>
            )}
            <h2>{v.kind === "shop" ? "Items available" : "Items for sale"}</h2>
            <ul>
              {v.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {v.description && (
              <>
                <h2>
                  {v.kind === "shop" ? "About this shop" : "Collection details"}
                </h2>
                <p className="shop-description">{v.description}</p>
              </>
            )}
            <h2>Visit {v.town}</h2>
            <CopyCommand
              command={townSpawnCommand(v.town)}
              label="Copy town spawn"
            />
            {v.kind === "bulk" && (
              <>
                <h2>Contact {v.username}</h2>
                <CopyCommand
                  command={bulkMailCommand(v)}
                  label="Copy interest mail"
                />
                <p>Paste the command in Minecraft to mail the seller.</p>
              </>
            )}
            <p className="shop-hint">
              Updated {new Date(v.updatedAt).toLocaleString()}
            </p>
          </article>
          <ExpandingConfirmation
            anchor={anchor}
            title={
              v.active
                ? v.kind === "bulk"
                  ? "Mark this sale as sold?"
                  : "Close this shop?"
                : "Reopen this listing?"
            }
            message={
              v.active
                ? "It will be hidden from other people. You can reopen it later."
                : "It will be visible to other people again."
            }
            triggerLabel="Update listing"
            confirmText="Confirm"
            busy={busy}
            error={actionError}
            onCancel={() => setAnchor(null)}
            onConfirm={async () => {
              setBusy(true);
              try {
                setUpdated(
                  await apiRequest<ShopListing>(
                    "/api/shop-search/" + id + "/status",
                    {
                      method: "POST",
                      body: {
                        active: !v.active,
                        version: v.version,
                      },
                    },
                  ),
                );
                setAnchor(null);
              } catch (e) {
                setActionError(reason(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
