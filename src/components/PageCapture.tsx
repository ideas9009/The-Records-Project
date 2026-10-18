import { useEffect, useRef, useState, type RefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Spinner } from "./Loading";
import { capturePage, screenshotName } from "../lib/page-capture";
import "./page-capture.css";
export default function PageCapture({
  target,
  title,
  disabled = false,
}: {
  target: RefObject<HTMLDivElement | null>;
  title: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const wrapper = useRef<HTMLDivElement>(null),
    lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  async function run(mode: "copy" | "save") {
    if (lock.current || !target.current) return;
    lock.current = true;
    setBusy(true);
    setOpen(false);
    setError("");
    setMessage("");
    try {
      const node = target.current;
      let windowsPreview = false;
      if (import.meta.env.DEV && !isTauri()) {
        const available = await fetch("/__trp_capture/available", {
          cache: "no-store",
        }).catch(() => null);
        if (available?.ok)
          windowsPreview = (await available.json()).available === true;
      }
      if (windowsPreview) {
        const { blob } = await capturePage(node);
        const response = await fetch("/__trp_capture/" + mode, {
          method: "POST",
          headers: {
            "Content-Type": "image/png",
            "X-TRP-Capture": "1",
            "X-TRP-Filename": screenshotName(title),
          },
          body: blob,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(
            result.error || "Windows could not complete the screenshot action.",
          );
        setMessage(
          mode === "copy"
            ? "Copied to Windows clipboard"
            : "Saved to Downloads: " + result.filename,
        );
      } else if (mode === "save" && isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          title: "Save screenshot",
          defaultPath: screenshotName(title),
          filters: [{ name: "PNG image", extensions: ["png"] }],
        });
        if (!path) return;
        const { blob } = await capturePage(node);
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
        setMessage("Screenshot saved");
      } else if (mode === "copy" && !isTauri()) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
          throw Error(
            "Image copying is unavailable here. Use Save image instead.",
          );
        const captured = capturePage(node);
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": captured.then((result) => result.blob),
          }),
        ]);
        setMessage("Screenshot copied");
      } else {
        const { canvas, blob } = await capturePage(node);
        if (mode === "copy") {
          const { Image } = await import("@tauri-apps/api/image");
          const { writeImage } =
            await import("@tauri-apps/plugin-clipboard-manager");
          const pixels = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height);
          const image = await Image.new(
            new Uint8Array(pixels.data),
            canvas.width,
            canvas.height,
          );
          try {
            await writeImage(image);
          } finally {
            await image.close();
          }
          setMessage("Screenshot copied");
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = screenshotName(title);
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          setMessage("Download requested. Check your browser downloads.");
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not capture this page. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="page-capture" ref={wrapper} data-capture-exclude>
      <button
        type="button"
        aria-label="Take page screenshot"
        aria-expanded={open}
        aria-controls="page-capture-options"
        disabled={busy || disabled}
        aria-busy={busy}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? (
          <Spinner />
        ) : (
          <span className="material-symbol" aria-hidden="true">
            photo_camera
          </span>
        )}
        <span>{busy ? "Capturing..." : "Screenshot"}</span>
      </button>
      {open && (
        <div className="page-capture-options" id="page-capture-options">
          <button type="button" onClick={() => void run("copy")}>
            <span className="material-symbol" aria-hidden="true">
              content_copy
            </span>
            Copy image
          </button>
          <button type="button" onClick={() => void run("save")}>
            <span className="material-symbol" aria-hidden="true">
              download
            </span>
            Save image
          </button>
        </div>
      )}
      {message && (
        <span className="capture-message" role="status">
          {message}
        </span>
      )}
      {error && (
        <p className="capture-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
