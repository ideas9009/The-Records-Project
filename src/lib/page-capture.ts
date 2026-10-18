export function captureSize(width: number, height: number) {
  return {
    width: Math.ceil(width + 48),
    height: Math.ceil(height + 48),
    pixelRatio: Math.min(
      2,
      Math.sqrt(32000000 / ((width + 48) * (height + 48))),
      15000 / (height + 48),
      15000 / (width + 48),
    ),
  };
}
export async function capturePage(node: HTMLElement) {
  if (
    node.querySelectorAll(".citizen-card").length > 1000 ||
    node.scrollHeight > 30000
  )
    throw Error(
      "This page is too large for a screenshot. Use Export PDF instead.",
    );
  const { toCanvas, getFontEmbedCSS } = await import("html-to-image");
  await document.fonts.ready;
  const previousExport = node.getAttribute("data-exporting");
  node.setAttribute("data-exporting", "true");
  try {
    const size = captureSize(node.scrollWidth, node.scrollHeight);
    const wallpaper = getComputedStyle(document.body).backgroundImage;
    const fontCSS = await getFontEmbedCSS(node, {
      preferredFontFormat: "woff2",
    });
    const canvas = await toCanvas(node, {
      fontEmbedCSS:
        fontCSS +
        "\n[data-exporting] .earthmc-table-scroll {overflow:visible!important;height:auto!important;max-height:none!important;} [data-exporting] .earthmc-info-table {height:auto!important;} [data-exporting] .earthmc-info-table tr, [data-exporting] .earthmc-info-table td, [data-exporting] .earthmc-info-table th, [data-exporting] .earthmc-info-table tbody, [data-exporting] .earthmc-info-table thead {height:auto!important;} ",
      ...size,
      backgroundColor: "#202024",
      preferredFontFormat: "woff2",
      filter: (element) =>
        !(
          element instanceof HTMLElement &&
          element.hasAttribute("data-capture-exclude")
        ),
      style: {
        width: size.width + "px",
        height: size.height + "px",
        boxSizing: "border-box",
        padding: "24px",
        margin: "0",
        overflow: "visible",
        zoom: "1",
        transform: "none",
        backgroundColor: "#202024",
        backgroundImage:
          wallpaper !== "none"
            ? "linear-gradient(#202024b3,#202024b3), " + wallpaper
            : "none",
        backgroundSize: "cover",
        backgroundPosition: "center top",
      },
    });
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(Error("Could not create the screenshot.")),
        "image/png",
      ),
    );
    return { canvas, blob };
  } finally {
    if (previousExport === null) node.removeAttribute("data-exporting");
    else node.setAttribute("data-exporting", previousExport);
  }
}
export const screenshotName = (title: string) =>
  "TRP-" +
  (title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "page") +
  "-" +
  new Date().toISOString().slice(0, 10) +
  ".png";
