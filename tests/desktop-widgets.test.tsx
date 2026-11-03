import { afterEach, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const platform = vi.hoisted(() => ({ desktop: false }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => platform.desktop,
  invoke: vi.fn(),
}));
import { canAccessPage, type Account } from "../src/lib/access";
import {
  widgetSizes,
  widgetPixels,
  validWidgetSize,
  widgetVoteProgress,
  widgetKind,
  shouldAutoScroll,
  widgetScrollStep,
} from "../src/lib/desktop-widgets";
import ExpansionPacks from "../src/pages/ExpansionPacks";
afterEach(() => {
  platform.desktop = false;
});
it("supports every half-unit size from 1×1 to 3×3 and rejects smaller or oversized values", () => {
  for (const width of widgetSizes)
    for (const height of widgetSizes) {
      expect(widgetPixels(width)).toBeGreaterThanOrEqual(200);
      expect(widgetPixels(height)).toBeLessThanOrEqual(600);
    }
  for (const size of [0, 0.5, 1.2, 3.5, NaN, Infinity]) {
    expect(validWidgetSize(size)).toBe(false);
    expect(() => widgetPixels(size)).toThrow();
  }
});
it("blocks Expansion Packs on the web even for Operators and direct subroutes", () => {
  const account = {
    username: "Owner",
    role: "operator",
    status: "approved",
    createdAt: "",
  } as Account;
  expect(canAccessPage(account, "expansions")).toBe(false);
  expect(canAccessPage(account, "settings:widgets")).toBe(false);
  expect(canAccessPage(account, "expansions:widgets")).toBe(false);
  expect(renderToStaticMarkup(<ExpansionPacks />)).toContain(
    "only available in the desktop app",
  );
  platform.desktop = true;
  expect(canAccessPage(account, "expansions")).toBe(true);
  expect(canAccessPage(account, "settings:widgets")).toBe(true);
  expect(canAccessPage({ ...account, status: "pending" }, "expansions")).toBe(
    false,
  );
});
it("handles unavailable VoteParty targets without showing a false percentage", () => {
  expect(widgetVoteProgress({ target: 5000, remaining: 1250 })).toBe(75);
  expect(widgetVoteProgress({ target: null, remaining: 1250 })).toBeNull();
  expect(widgetVoteProgress({ target: 0, remaining: 1250 })).toBeNull();
  expect(widgetVoteProgress({ target: 5000, remaining: -1 })).toBeNull();
  expect(widgetVoteProgress({ target: 5000, remaining: 6000 })).toBe(0);
});
it("only recognizes the three included widget kinds", () => {
  for (const kind of ["voteparty", "balance", "online"])
    expect(widgetKind(kind)).toBe(true);
  for (const kind of [null, "../../main", "companies"])
    expect(widgetKind(kind)).toBe(false);
});

it("only auto-scrolls an opted-in locked online widget", () => {
  for (const kind of ["online", "balance", "voteparty"] as const)
    for (const locked of [false, true])
      for (const enabled of [false, true])
        expect(shouldAutoScroll(kind, locked, enabled)).toBe(
          kind === "online" && locked && enabled,
        );
});
it("scrolls slowly, caps delayed frames and reverses at both ends", () => {
  expect(widgetScrollStep(20, 1, 50, 100).position).toBeCloseTo(20.6);
  expect(widgetScrollStep(20, 1, 5000, 100).position).toBeCloseTo(20.6);
  expect(widgetScrollStep(99.8, 1, 50, 100)).toEqual({
    position: 100,
    direction: -1,
    pause: true,
  });
  expect(widgetScrollStep(0.2, -1, 50, 100)).toEqual({
    position: 0,
    direction: 1,
    pause: true,
  });
  expect(widgetScrollStep(0, 1, 50, 0).position).toBe(0);
});

import WidgetTile from "../src/components/WidgetTile";
import type { WidgetConfig, WidgetData } from "../src/lib/desktop-widgets";
const tileConfig: WidgetConfig = {
  kind: "voteparty",
  enabled: true,
  mode: "desktop",
  width: 1,
  height: 1,
  x: 0,
  y: 0,
  locked: false,
  blur: true,
  auto_scroll: false,
  anchor: null,
};
const tileData: WidgetData = {
  remaining: 3458,
  target: 5000,
  balance: 1161,
  players: [{ name: "TownBuilder", uuid: "123456781234123412341234567890ab" }],
  checkedAt: 1,
  errors: {},
};
it("keeps the locked tile free of edit controls and exposes them when unlocked", () => {
  const locked = renderToStaticMarkup(
    <WidgetTile
      kind="voteparty"
      config={{ ...tileConfig, locked: true }}
      data={tileData}
    />,
  );
  expect(locked).not.toContain("<button");
  expect(locked).toContain("Votes remaining");
  const unlocked = renderToStaticMarkup(
    <WidgetTile kind="voteparty" config={tileConfig} data={tileData} />,
  );
  expect(unlocked).toContain('aria-label="Resize widget"');
  expect(unlocked).not.toContain('aria-label="Lock widget"');
  expect(unlocked).toContain('aria-label="Widget settings"');
  expect(unlocked).not.toContain("drag_handle");
});
it("keeps the last successful values visible when refresh fails", () => {
  const html = renderToStaticMarkup(
    <WidgetTile
      kind="balance"
      config={{ ...tileConfig, kind: "balance" }}
      data={tileData}
      error="EarthMC is unavailable"
    />,
  );
  expect(html).toContain("1,161");
  expect(html).toContain("Showing last update");
  expect(html).toContain("EarthMC is unavailable");
});
it("renders online player names and faces without a separate presence subscription", () => {
  const html = renderToStaticMarkup(
    <WidgetTile
      kind="online"
      config={{ ...tileConfig, kind: "online", locked: true }}
      data={tileData}
    />,
  );
  expect(html).toContain("TownBuilder");
  expect(html).toContain("mc-heads.net/avatar/");
  expect(html).toContain("1 players online");
  expect(html).not.toContain("<button");
});

import {SharedControls} from '../src/components/WidgetSettings';
import {sharedWidgetSettings,setWidgetPreferences} from '../src/lib/desktop-widgets';
import {invoke} from '@tauri-apps/api/core';
it('provides shared size, lock, blur and tint controls without individual see-through settings',()=>{
 const pack={installed:true,snap:true,widgets:[{...tileConfig,size_multiplier:.5,blur_level:2,tint:.3}]};
 const save=vi.fn();const html=renderToStaticMarkup(<SharedControls pack={pack} busy={false} change={save}/>);
 expect(html).toContain('Lock all widgets');expect(html.match(/type="range"/g)).toHaveLength(3);expect(html).toContain('50%');expect(html).toContain('Strong');expect(html).toContain('30%');expect(html).not.toContain('See-through');expect(save).not.toHaveBeenCalled();
});
it('uses safe legacy defaults and submits one shared preferences request',async()=>{
 const settings=sharedWidgetSettings({installed:true,snap:true,widgets:[tileConfig]});expect(settings).toEqual({locked:false,size_multiplier:1,blur_level:1,tint:.75});
 vi.mocked(invoke).mockClear();await setWidgetPreferences({...settings,locked:true});expect(invoke).toHaveBeenCalledExactlyOnceWith('widgets_preferences',{settings:{...settings,locked:true}});
});
it('scales the full tile rather than only its value text',()=>{
 const html=renderToStaticMarkup(<WidgetTile kind="voteparty" config={{...tileConfig,size_multiplier:.5,tint:.3}} data={tileData}/>);
 expect(html).toContain('--widget-scale:0.5');expect(html).toContain('--widget-tint:0.3');expect(html).toContain('Resize widget');expect(html).not.toContain('Lock widget');
});
