import { useLayoutEffect, useRef } from "react";
import { Spinner } from "./Loading";
export function confirmationPosition(
  anchor: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  return {
    left: Math.max(12, Math.min(anchor.left, viewport.width - size.width - 12)),
    top: Math.max(12, Math.min(anchor.top, viewport.height - size.height - 12)),
  };
}
export default function ExpandingConfirmation({
  anchor,
  title,
  message,
  triggerLabel,
  triggerIcon,
  confirmText,
  onConfirm,
  onCancel,
  busy = false,
  error = "",
}: {
  anchor: HTMLElement | null;
  title: string;
  message: string;
  triggerLabel: string;
  triggerIcon?: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    headingId = useRef("confirm-" + crypto.randomUUID());
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!anchor) {
      element.close();
      return;
    }
    const place = () => {
      const rect = anchor.getBoundingClientRect(),
        size = element.getBoundingClientRect(),
        position = confirmationPosition(rect, size, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
      element.style.left = position.left + "px";
      element.style.top = position.top + "px";
      element.style.setProperty(
        "--confirmation-origin-width",
        rect.width + "px",
      );
      element.style.setProperty(
        "--confirmation-origin-height",
        rect.height + "px",
      );
    };
    if (!element.open) element.showModal();
    place();
    cancel.current?.focus();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  return (
    <dialog
      ref={dialog}
      className="card expanding-confirmation"
      aria-labelledby={headingId.current}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirmation-origin">
        {triggerIcon && (
          <span className="material-symbol" aria-hidden="true">
            {triggerIcon}
          </span>
        )}
        <span>{triggerLabel}</span>
      </div>
      <div className="confirmation-content">
        <h2 id={headingId.current}>{title}</h2>
        <p>{message}</p>
        {error && <p role="alert">{error}</p>}
        <div className="confirmation-actions">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>
            {confirmText === "Discard changes" ? "Keep editing" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
          >
            {busy && <Spinner />}
            {busy ? "Please wait…" : confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
