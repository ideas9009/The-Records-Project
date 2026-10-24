import { useLayoutEffect, type RefObject } from "react";
const chromeSelector =
  ".page-banner:not(:empty), .news-toolbar, .town-toolbar, .citizens-toolbar, .board-toolbar:has(.board-search), .admin-tabs, .admin-search";
const surfaceSelector =
  ".card, .stat, .entity-card, .job-card, .quick-card, .citizen-card, .admin-row";
const chromeProperties = ["--pinned-top"];
const edgeProperties = [
  "--edge-top",
  "--edge-bottom-start",
  "--edge-bottom-end",
  "--edge-top-y",
  "--edge-top-height",
  "--edge-bottom-y",
  "--edge-bottom-height",
];
export function surfaceEdges(
  top: number,
  height: number,
  start: number,
  end: number,
  fadeTop: boolean,
  fadeBottom: boolean,
  size = 28,
) {
  const topEdge = fadeTop ? start - top : -size;
  const bottomEdge = fadeBottom ? end - top : height + size;
  const topY = Math.max(0, topEdge),
    bottomY = Math.max(0, bottomEdge - size);
  return {
    active:
      (fadeTop && top < start + size) ||
      (fadeBottom && top + height > end - size),
    top: topEdge,
    bottomStart: bottomEdge - size,
    bottomEnd: bottomEdge,
    topY,
    topHeight: fadeTop
      ? Math.max(0, Math.min(height, topEdge + size) - topY)
      : 0,
    bottomY,
    bottomHeight: fadeBottom
      ? Math.max(0, Math.min(height, bottomEdge) - bottomY)
      : 0,
  };
}
export function pinnedOffsets(heights: number[], gap = 12) {
  let offset = 0;
  return heights.map((height) => {
    const top = offset;
    offset += height + gap;
    return top;
  });
}
/** Keep React's DOM/state in place; only decorate existing scroll surfaces. */
export function usePageScrollEffects(
  ref: RefObject<HTMLElement | null>,
  pageKey: string,
) {
  useLayoutEffect(() => {
    const main = ref.current;
    if (!main) return;
    let frame = 0,
      needsScan = true,
      needsLayout = true,
      stopped = false;
    let chrome: HTMLElement[] = [],
      surfaces: HTMLElement[] = [];
    const visible = new Set<HTMLElement>(),
      decorated = new Set<HTMLElement>();
    const schedule = (scan = false, layout = false) => {
      needsScan ||= scan;
      needsLayout ||= layout;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(() => schedule(false, true));
    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          entry.isIntersecting ? visible.add(node) : visible.delete(node);
          node.toggleAttribute("data-scroll-offscreen", !entry.isIntersecting);
          if (!entry.isIntersecting) node.removeAttribute("data-edge-softened");
        }
        schedule();
      },
      { root: main, rootMargin: "160px 0px", threshold: 0 },
    );
    const clearChrome = (node: HTMLElement) => {
      node.removeAttribute("data-page-pinned");
      node.removeAttribute("data-page-chrome");
      chromeProperties.forEach((key) => node.style.removeProperty(key));
    };
    const clearSurface = (node: HTMLElement) => {
      node.removeAttribute("data-scroll-surface");
      node.removeAttribute("data-scroll-offscreen");
      node.removeAttribute("data-scroll-relative");
      node.removeAttribute("data-edge-softened");
      edgeProperties.forEach((key) => node.style.removeProperty(key));
    };
    function scan() {
      needsLayout = true;
      chrome.forEach(clearChrome);
      surfaces.forEach(clearSurface);
      decorated.clear();
      resize.disconnect();
      resize.observe(main!);
      intersection.disconnect();
      visible.clear();
      const candidates = Array.from(
        main!.querySelectorAll<HTMLElement>(chromeSelector),
      ).filter(
        (node) =>
          !node.closest("dialog, .developer-preview, form") &&
          node.getBoundingClientRect().height > 0 &&
          !node.parentElement?.closest(chromeSelector),
      );
      chrome = candidates;
      chrome.forEach((node) => {
        node.setAttribute(
          "data-page-chrome",
          node.classList.contains("page-banner") ? "banner" : "controls",
        );
        node.setAttribute(
          "data-page-pinned",
          node.classList.contains("page-banner") ? "banner" : "controls",
        );
        resize.observe(node);
      });
      const candidatesForEdges = Array.from(
        main!.querySelectorAll<HTMLElement>(surfaceSelector),
      ).filter(
        (node) =>
          !node.closest("dialog, .developer-preview, [data-page-pinned]") &&
          !node.querySelector("[data-page-pinned]"),
      );
      const candidatesSet = new Set(candidatesForEdges);
      surfaces = candidatesForEdges.filter((node) => {
        for (
          let parent = node.parentElement;
          parent && parent !== main;
          parent = parent.parentElement
        ) {
          if (candidatesSet.has(parent)) return false;
        }
        return true;
      });
      const staticSurfaces = new Set(
        surfaces.filter((node) => getComputedStyle(node).position === "static"),
      );
      surfaces.forEach((node) => {
        node.setAttribute("data-scroll-surface", "");
        node.setAttribute("data-scroll-offscreen", "");
        decorated.add(node);
        if (staticSurfaces.has(node))
          node.setAttribute("data-scroll-relative", "");
        intersection.observe(node);
      });
    }
    function update() {
      frame = 0;
      if (stopped) return;
      if (needsScan) {
        needsScan = false;
        scan();
      }
      const rect = main!.getBoundingClientRect();
      // Geometry is in physical pixels; compensate for the app's interface zoom.
      const scale = rect.height / main!.offsetHeight || 1;
      // Header sizes change on resize/content updates, not on every scroll frame.
      if (needsLayout) {
        needsLayout = false;
        const heights = chrome.map(
          (node) => node.getBoundingClientRect().height / scale,
        );
        const offsets = pinnedOffsets(heights);
        main!.style.setProperty(
          "--page-banner-height",
          (heights[
            chrome.findIndex((node) => node.classList.contains("page-banner"))
          ] || 0) + "px",
        );
        const availableHeight = main!.clientHeight;
        chrome.forEach((node, index) => {
          const canPin =
            index === 0 ||
            offsets[index] + heights[index] < availableHeight - 100;
          if (canPin) {
            node.setAttribute(
              "data-page-pinned",
              node.classList.contains("page-banner") ? "banner" : "controls",
            );
            node.style.setProperty("--pinned-top", offsets[index] + "px");
          } else node.removeAttribute("data-page-pinned");
        });
      }
      // Read all geometry before writing styles; avoid a forced layout per tile.
      let pinnedBottom = rect.top;
      for (const node of chrome) {
        if (node.hasAttribute("data-page-pinned"))
          pinnedBottom = Math.max(
            pinnedBottom,
            node.getBoundingClientRect().bottom + 12 * scale,
          );
      }
      const fadeTop = main!.scrollTop > 1,
        fadeBottom =
          main!.scrollTop + main!.clientHeight < main!.scrollHeight - 1;
      const measurements = Array.from(visible, (node) => ({
        node,
        card: node.getBoundingClientRect(),
      }));
      setStyle(
        main!,
        "--pinned-chrome-height",
        Math.max(0, (pinnedBottom - rect.top) / scale) + "px",
      );
      for (const { node, card } of measurements) {
        const edges = surfaceEdges(
          card.top / scale,
          card.height / scale,
          pinnedBottom / scale,
          rect.bottom / scale,
          fadeTop,
          fadeBottom,
        );
        node.toggleAttribute("data-edge-softened", edges.active);
        if (!edges.active) continue;
        [
          edges.top,
          edges.bottomStart,
          edges.bottomEnd,
          edges.topY,
          edges.topHeight,
          edges.bottomY,
          edges.bottomHeight,
        ].forEach((value, index) =>
          setStyle(node, edgeProperties[index], value + "px"),
        );
      }
    }
    function setStyle(node: HTMLElement, key: string, value: string) {
      if (node.style.getPropertyValue(key) !== value)
        node.style.setProperty(key, value);
    }
    // Faces, online dots and text updates do not require rebuilding every observer.
    const relevant = (node: Node) =>
      node instanceof Element &&
      (node.matches(chromeSelector + ", " + surfaceSelector) ||
        !!node.querySelector(chromeSelector + ", " + surfaceSelector));
    const mutation = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(relevant),
        )
      )
        schedule(true);
    });
    mutation.observe(main, { subtree: true, childList: true });
    main.addEventListener("scroll", onScroll, { passive: true });
    function onScroll() {
      schedule();
    }
    update();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      intersection.disconnect();
      main.removeEventListener("scroll", onScroll);
      chrome.forEach(clearChrome);
      decorated.forEach(clearSurface);
      main.style.removeProperty("--pinned-chrome-height");
      main.style.removeProperty("--page-banner-height");
    };
  }, [ref, pageKey]);
}
