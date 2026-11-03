import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "../lib/auth-context";
import WidgetTile from "../components/WidgetTile";
import {
  readWidgetPack,
  setWidget,

  openWidgetMain,
  shouldAutoScroll,
  widgetScrollStep,
  widgetError,
  type WidgetPack,
  type WidgetKind,
  type WidgetConfig,
  type WidgetData,
} from "../lib/desktop-widgets";
import "./WidgetHost.css";
export default function WidgetHost({ kind }: { kind: WidgetKind }) {
  const { account, loading, error: authError, retry } = useAuth();
  const [widget, setConfig] = useState<WidgetConfig | null>(null),
    [data, setData] = useState<WidgetData | null>(null),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [dragging, setDragging] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointer: number;
    frame: number;
    inFlight: boolean;
    chain: Promise<unknown>;
  } | null>(null);
  useEffect(() => {
    let active = true,
      unlisten: (() => void) | undefined;
    const update = (pack: WidgetPack) => {
      if (active) setConfig(pack.widgets.find((w) => w.kind === kind) || null);
    };
    void readWidgetPack()
      .then(update)
      .catch((reason) => active && setActionError(widgetError(reason)));
    void listen<WidgetPack>("widgets-changed", (event) => update(event.payload))
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch((reason) => active && setActionError(widgetError(reason)));
    return () => {
      active = false;
      unlisten?.();
    };
  }, [kind]);
  useEffect(() => {
    if (!account || account.status !== "approved") {
      setData(null);
      return;
    }
    let active = true,
      running = false,
      manual = revision > 0;
    const load = async () => {
      if (running) return;
      if (navigator.onLine === false) {
        setError("Offline. Waiting for a connection.");
        return;
      }
      running = true;
      try {
        const next = await invoke<WidgetData>("widgets_data", {
          refresh: manual,
        });
        manual = false;
        if (active) {
          setError(next.errors[kind] || "");
          setData((previous) => (next.errors[kind] ? previous : next));
        }
      } catch (reason) {
        if (active) setError(widgetError(reason));
      } finally {
        running = false;
      }
    };
    void load();
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const offline = () => setError("Offline. Waiting for a connection.");
    const timer = setInterval(refresh, 60000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [account?.uid, account?.status, kind, revision]);
  const finish = (cancel = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    setDragging(false);
    void current.chain
      .catch(() => {})
      .then(() => invoke("widgets_drag", { action: cancel ? "cancel" : "end" }))
      .catch((reason) => setActionError(widgetError(reason)));
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(true);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (drag.current) {
        cancelAnimationFrame(drag.current.frame);
        void invoke("widgets_drag", { action: "cancel" }).catch(() => {});
      }
    };
  }, []);
  function start(event: PointerEvent<HTMLElement>, resize = false) {
    if (
      event.button !== 0 ||
      drag.current ||
      !widget ||
      widget.locked ||
      (!resize && widget.anchor)
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActionError("");
    setDragging(true);
    const chain = invoke("widgets_drag", {
      action: resize ? "start_resize" : "start_move",
    });
    const current = {
      pointer: event.pointerId,
      frame: 0,
      inFlight: false,
      chain,
    };
    drag.current = current;
    void chain.catch((reason) => {
      if (drag.current === current) drag.current = null;
      setDragging(false);
      setActionError(widgetError(reason));
    });
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (
      !current ||
      current.pointer !== event.pointerId ||
      current.frame ||
      current.inFlight
    )
      return;
    current.frame = requestAnimationFrame(() => {
      current.frame = 0;
      current.inFlight = true;
      current.chain = current.chain.then(() =>
        invoke("widgets_drag", { action: "move" }),
      );
      void current.chain
        .catch((reason) => setActionError(widgetError(reason)))
        .finally(() => {
          current.inFlight = false;
        });
    });
  }
  function end(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    finish();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function change(next: WidgetConfig) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const pack = await setWidget(next);
      setConfig(pack.widgets.find((w) => w.kind === kind) || null);
    } catch (reason) {
      setActionError(widgetError(reason));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!shouldAutoScroll(kind, !!widget?.locked, !!widget?.auto_scroll))
      return;
    const pane = content.current;
    if (!pane) return;
    let frame = 0,
      last = 0,
      position = pane.scrollTop,
      direction = 1,
      pauseUntil = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const tick = (now: number) => {
      frame = 0;
      if (document.visibilityState === "hidden") return;
      const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
      if (max <= 1) return;
      const elapsed = now - last;
      last = now;
      if (now >= pauseUntil) {
        const next = widgetScrollStep(position, direction, elapsed, max);
        position = next.position;
        direction = next.direction;
        pane.scrollTop = position;
        if (next.pause) pauseUntil = now + 1200;
      }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      stop();
      position = pane.scrollTop;
      last = performance.now();
      pauseUntil = last + 1200;
      if (
        document.visibilityState !== "hidden" &&
        pane.scrollHeight > pane.clientHeight + 1
      )
        frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resume);
    observer.observe(pane);
    if (pane.firstElementChild) observer.observe(pane.firstElementChild);
    document.addEventListener("visibilitychange", resume);
    pane.addEventListener("wheel", resume, { passive: true });
    resume();
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      pane.removeEventListener("wheel", resume);
    };
  }, [kind, widget?.locked, widget?.auto_scroll, data?.players.length]);
  const handlers = {
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
  const message = loading
    ? "Connecting…"
    : !account || account.status !== "approved"
      ? authError || "Sign in to TRP to use widgets."
      : undefined;
  return (
    <WidgetTile
      kind={kind}
      config={widget}
      data={data}
      message={message}
      error={actionError || error}
      busy={busy}
      dragging={dragging}
      contentRef={content}
      dragHandlers={{ ...handlers, onPointerDown: (e) => start(e) }}
      resizeHandlers={{ ...handlers, onPointerDown: (e) => start(e, true) }}
      onSettings={() =>
        void openWidgetMain(true).catch((reason) =>
          setActionError(widgetError(reason)),
        )
      }

      onClose={() => widget && void change({ ...widget, enabled: false })}
      onRetry={() => {
        setActionError("");
        if (authError) retry();
        else setRevision((v) => v + 1);
      }}
    />
  );
}
