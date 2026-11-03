import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { LoadingStatus } from "./Loading";
import {
  widgetDefinitions,
  sharedWidgetSettings, setWidgetPreferences, type SharedWidgetSettings,
  readWidgetPack,
  readWidgetWindows,
  setWidget,
  setWidgetSnapping,
  widgetError,
  type WidgetPack,
  type WidgetConfig,
  type WidgetTarget,
} from "../lib/desktop-widgets";
import "./widget-settings.css";
export default function WidgetSettings({
  go,
}: {
  go?: (page: string) => void;
}) {
  const [choosingWindow, setChoosingWindow] = useState<Record<string, boolean>>(
    {},
  );
  const [pack, setPack] = useState<WidgetPack | null>(null),
    [targets, setTargets] = useState<WidgetTarget[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true,
      unlisten: (() => void) | undefined;
    const load = () => {
      void Promise.all([readWidgetPack(), readWidgetWindows()])
        .then(([pack, targets]) => {
          if (active) {
            setPack(pack);
            setTargets(targets);
          }
        })
        .catch((reason) => {
          if (active) setError(widgetError(reason));
        });
    };
    load();
    void listen<WidgetPack>("widgets-changed", (event) => {
      if (active) setPack(event.payload);
    })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {});
    window.addEventListener("focus", load);
    return () => {
      active = false;
      unlisten?.();
      window.removeEventListener("focus", load);
    };
  }, []);
  async function change(widget: WidgetConfig) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setPack(await setWidget(widget));
    } catch (reason) {
      setError(widgetError(reason));
    } finally {
      setBusy(false);
    }
  }
  async function shared(settings: SharedWidgetSettings) {
    if(busy)return;setBusy(true);setError('');
    try{setPack(await setWidgetPreferences(settings));}catch(reason){setError(widgetError(reason));}finally{setBusy(false);}
  }
  if (!isTauri())
    return (
      <section className="card">
        <h2>Desktop Widgets · Beta</h2>
        <p>Desktop Widgets are only available in the app.</p>
      </section>
    );
  return (
    <div className="widget-settings">
      {error && (
        <p className="card" role="alert">
          {error}
        </p>
      )}
      {!pack ? (
        <LoadingStatus>Loading widget settings…</LoadingStatus>
      ) : !pack.installed ? (
        <section className="card setting-card">
          <h2>Desktop Widgets · Beta</h2>
          <p>Enable the included Desktop Widgets pack to get started.</p>
          <button onClick={() => go?.("expansions")}>
            Open Expansion Packs
          </button>
        </section>
      ) : (
        <>
          <section className="card setting-card">
            <h2>Desktop Widgets · Beta</h2>
            <p>
              Drag an unlocked widget’s title to move it. Drag its lower-right
              corner to resize it; it snaps to the nearest half-step when
              released. Lock it when you are happy with the position.
            </p>
            <SharedControls pack={pack} busy={busy} change={shared}/>
            <label className="widget-setting-check">
              <input
                type="checkbox"
                checked={pack.snap}
                disabled={busy}
                onChange={(e) => {
                  setBusy(true);
                  void setWidgetSnapping(e.target.checked)
                    .then(setPack)
                    .catch((reason) => setError(widgetError(reason)))
                    .finally(() => setBusy(false));
                }}
              />
              <span>
                Snap widgets together
                <small>Keep a gap between nearby tiles.</small>
              </span>
            </label>
          </section>
          {widgetDefinitions.map((definition) => {
            const widget = pack.widgets.find(
              (w) => w.kind === definition.kind,
            )!;
            return (
              <section
                className="card setting-card widget-settings-card"
                key={widget.kind}
              >
                <div className="widget-settings-heading">
                  <div>
                    <span className="material-symbol" aria-hidden="true">
                      {definition.icon}
                    </span>
                    <h3>{definition.name}</h3>
                  </div>
                  <span className="widget-settings-size">
                    {widget.width}×{widget.height}
                    {widget.locked ? " · Locked" : ""}
                  </span>
                  <label className="widget-enable-switch"><input type="checkbox" role="switch" aria-label={'Enable '+definition.name} checked={widget.enabled} disabled={busy} onChange={e=>void change({...widget,enabled:e.target.checked})}/><span>{widget.enabled?'Enabled':'Disabled'}</span></label>
                </div>
                {widget.kind === "online" && (
                  <label className="widget-setting-check">
                    <input
                      type="checkbox"
                      checked={widget.auto_scroll}
                      disabled={busy}
                      onChange={(e) =>
                        void change({
                          ...widget,
                          auto_scroll: e.target.checked,
                        })
                      }
                    />
                    <span>
                      Automatically scroll when locked
                      <small>
                        Slowly scroll the online-player list. Off by default.
                      </small>
                    </span>
                  </label>
                )}
                <div className="widget-settings-fields">
                  <label>
                    Placement
                    <select
                      disabled={busy}
                      value={
                        widget.anchor || choosingWindow[widget.kind]
                          ? "follow"
                          : widget.mode
                      }
                      onChange={(e) => {
                        const follow = e.target.value === "follow";
                        setChoosingWindow((current) => ({
                          ...current,
                          [widget.kind]: follow,
                        }));
                        if (!follow)
                          void change({
                            ...widget,
                            anchor: null,
                            mode: e.target.value as WidgetConfig["mode"],
                          });
                      }}
                    >
                      <option value="desktop">Desktop only</option>
                      <option value="overlay">Always on top</option>
                      <option value="follow">Follow an app window</option>
                    </select>
                  </label>
                  {(widget.anchor || choosingWindow[widget.kind]) && (
                    <label>
                      App window
                      <select
                        disabled={busy}
                        value={widget.anchor?.id || ""}
                        onChange={(e) => {
                          const target = targets.find(
                            (t) => t.id === e.target.value,
                          );
                          if (!target) return;
                          setChoosingWindow((current) => ({
                            ...current,
                            [widget.kind]: false,
                          }));
                          void change({
                            ...widget,
                            mode: target ? "overlay" : widget.mode,
                            anchor: target
                              ? {
                                  id: target.id,
                                  pid: target.pid,
                                  corner: widget.anchor?.corner || "top-right",
                                }
                              : null,
                          });
                        }}
                      >
                        <option value="" disabled>
                          Choose an open window
                        </option>
                        {widget.anchor &&
                          !targets.some((t) => t.id === widget.anchor!.id) && (
                            <option value={widget.anchor.id}>
                              Selected window is unavailable
                            </option>
                          )}
                        {targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {widget.anchor && (
                    <label>
                      Corner
                      <select
                        disabled={busy}
                        value={widget.anchor.corner}
                        onChange={(e) =>
                          void change({
                            ...widget,
                            anchor: {
                              ...widget.anchor!,
                              corner: e.target.value as NonNullable<
                                WidgetConfig["anchor"]
                              >["corner"],
                            },
                          })
                        }
                      >
                        <option value="top-left">Top left</option>
                        <option value="top-right">Top right</option>
                        <option value="bottom-left">Bottom left</option>
                        <option value="bottom-right">Bottom right</option>
                      </select>
                    </label>
                  )}
                </div>
                {(widget.anchor || choosingWindow[widget.kind]) && (
                  <p className="widget-settings-note">
                    Pinned widgets follow the selected window’s content area and
                    hide while it is minimized. The pin clears if that window
                    closes. Open another app window and return here to update
                    the list.
                  </p>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export function SharedControls({pack,busy,change}:{pack:WidgetPack;busy:boolean;change:(settings:SharedWidgetSettings)=>Promise<void>}) {
 const [settings,setSettings]=useState(()=>sharedWidgetSettings(pack));
 useEffect(()=>setSettings(sharedWidgetSettings(pack)),[pack]);
 const saving=useRef(false);
 const commit=()=>{if(!saving.current&&JSON.stringify(settings)!==JSON.stringify(sharedWidgetSettings(pack))){saving.current=true;void change(settings).finally(()=>{saving.current=false;});}};
 return <div className="widget-global-controls">
  <label className="widget-setting-check"><input type="checkbox" role="switch" checked={settings.locked} disabled={busy} onChange={e=>void change({...settings,locked:e.target.checked})}/><span>Lock all widgets<small>Prevents moving and resizing, and hides controls on every widget.</small></span></label>
  {([{key:'size_multiplier',label:'Size multiplier',min:.5,max:1.5,step:.05,value:Math.round(settings.size_multiplier*100)+'%'},{key:'blur_level',label:'Blur level',min:0,max:2,step:1,value:['Off','Soft','Strong'][settings.blur_level]},{key:'tint',label:'Tint level',min:0,max:1,step:.05,value:Math.round(settings.tint*100)+'%'}] as const).map(slider=><label className="widget-global-slider" key={slider.key}><span>{slider.label}<output>{slider.value}</output></span><input aria-label={slider.label} type="range" min={slider.min} max={slider.max} step={slider.step} value={settings[slider.key]} disabled={busy} onChange={e=>setSettings({...settings,[slider.key]:Number(e.target.value)})} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>)}
  <p className="widget-settings-note">Size scales the entire widget, including text and controls. Blur uses Windows’ Off, Soft and Strong effects. Appearance and locking apply to enabled and disabled widgets.</p>
 </div>;
}
