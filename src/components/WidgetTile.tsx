import {
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from "react";
import {
  PartyPopper,
  Coins,
  Users,
  Settings2,
  Lock,
  X,
  Grip,
  RefreshCw,
  Pin,
} from "lucide-react";
import {
  widgetDefinitions,
  widgetVoteProgress,
  type WidgetKind,
  type WidgetConfig,
  type WidgetData,
} from "../lib/desktop-widgets";
export type WidgetTileProps = {
  kind: WidgetKind;
  config: WidgetConfig | null;
  data: WidgetData | null;
  message?: string;
  error?: string;
  busy?: boolean;
  dragging?: boolean;
  contentRef?: Ref<HTMLDivElement>;
  dragHandlers?: HTMLAttributes<HTMLDivElement>;
  resizeHandlers?: HTMLAttributes<HTMLButtonElement>;
  onSettings?: () => void;
  onLock?: () => void;
  onClose?: () => void;
  onRetry?: () => void;
};
function Face({ name, uuid }: { name: string; uuid: string }) {
  const [failed, setFailed] = useState(false);
  const id = /^[a-f0-9-]{32,36}$/i.test(uuid)
    ? uuid
    : /^[a-z0-9_]{3,16}$/i.test(name)
      ? name
      : null;
  return (
    <span className="widget-face" aria-label={name + " Minecraft face"}>
      {id && !failed ? (
        <img
          src={"https://mc-heads.net/avatar/" + encodeURIComponent(id) + "/64"}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}
export default function WidgetTile({
  kind,
  config,
  data,
  message,
  error,
  busy,
  dragging,
  contentRef,
  dragHandlers,
  resizeHandlers,
  onSettings,
  onLock,
  onClose,
  onRetry,
}: WidgetTileProps) {
  const definition = widgetDefinitions.find((w) => w.kind === kind)!;
  const Icon =
    kind === "voteparty" ? PartyPopper : kind === "balance" ? Coins : Users;
  const progress = data ? widgetVoteProgress(data) : null;
  const value = kind === "balance" ? data?.balance : data?.remaining;
  const formatted =
    typeof value === "number"
      ? value.toLocaleString(undefined, {
          notation: value >= 1000000 ? "compact" : "standard",
          maximumFractionDigits: kind === "balance" ? 1 : 0,
        })
      : "—";
  return (
    <section
      className="trp-desktop-widget"
      data-kind={kind}
      data-locked={config?.locked ? "true" : undefined}
      data-blur={config?.blur === false ? "false" : "true"}
      data-dragging={dragging ? "true" : undefined}
      data-pinned={config?.anchor ? "true" : undefined}
      style={
        {
          "--widget-color": definition.color,
          "--widget-scale": config?.size_multiplier ?? 1,
          "--widget-tint": config?.tint ?? 0.75,
          "--value-chars": Math.max(4, formatted.length),
        } as CSSProperties
      }
      aria-label={definition.name + " widget"}
    >
      <header
        className="widget-heading"
        {...dragHandlers}
        title={
          config?.anchor
            ? "Following an app window. Change placement in Settings."
            : config?.locked
              ? definition.name
              : "Drag to move"
        }
      >
        <span className="widget-symbol">
          <Icon size={18} aria-hidden="true" />
        </span>
        <h1>{definition.name}</h1>
        {config?.anchor && (
          <Pin
            className="widget-pinned"
            size={13}
            aria-label="Pinned to an app window"
          />
        )}
        {kind === "online" && data && !message && (
          <span
            className="widget-count"
            aria-label={data.players.length + " players online"}
          >
            {data.players.length}
          </span>
        )}
      </header>
      <div className="widget-content" ref={contentRef}>
        {message || (!data && error) ? (
          <div className="widget-message" role="status">
            <p>{message || error}</p>
            {error && <button onClick={onRetry}>Try again</button>}
            {message?.includes("Sign in") && (
              <button onClick={onSettings}>Open TRP</button>
            )}
          </div>
        ) : !data ? (
          <div className="widget-skeleton" aria-label="Loading EarthMC">
            <i />
            <i />
          </div>
        ) : kind === "online" ? (
          <div className="widget-online">
            {data.players.length ? (
              data.players.map((p) => (
                <div className="widget-player" key={p.uuid || p.name}>
                  <Face name={p.name} uuid={p.uuid} />
                  <span title={p.name}>{p.name}</span>
                </div>
              ))
            ) : (
              <div className="widget-empty">
                <Users size={25} />
                <p>No nation players online</p>
              </div>
            )}
          </div>
        ) : (
          <div
            className={
              kind === "voteparty"
                ? "widget-metric widget-vote"
                : "widget-metric"
            }
          >
            <div className="widget-value">
              <strong title={value?.toLocaleString()}>{formatted}</strong>
              <span>
                {kind === "voteparty" ? "Votes remaining" : "Gold · Byzantium"}
              </span>
            </div>
            {kind === "voteparty" && progress !== null && (
              <div
                className="widget-vote-ring"
                style={{ "--vote-progress": progress + "%" } as CSSProperties}
                aria-label={Math.round(progress) + " percent complete"}
              >
                <span>
                  {Math.round(progress)}
                  <small>%</small>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {error && data && (
        <div className="widget-stale" role="status" title={error}>
          Showing last update
        </div>
      )}
      {!config?.locked && (
        <footer className="widget-tools">
          <button
            aria-label="Widget settings"
            title="Widget settings"
            onClick={onSettings}
          >
            <Settings2 size={15} />
          </button>

          {error && (
            <button
              aria-label="Refresh widget"
              title="Refresh"
              onClick={onRetry}
            >
              <RefreshCw size={14} />
            </button>
          )}
          <span className="widget-size">
            {dragging
              ? "Adjusting…"
              : config
                ? config.width + " × " + config.height
                : ""}
          </span>
          <button
            aria-label="Hide widget"
            title="Hide widget"
            disabled={busy || !config}
            onClick={onClose}
          >
            <X size={15} />
          </button>
          <button
            className="widget-resize"
            aria-label="Resize widget"
            title="Drag to resize · release to snap"
            {...resizeHandlers}
          >
            <Grip size={15} />
          </button>
        </footer>
      )}
    </section>
  );
}
