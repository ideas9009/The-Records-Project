import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { isTauri } from "@tauri-apps/api/core";
import { MessageSquarePlus, X, CheckCircle2, Send } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { apiRequest } from "../lib/api";
import { APP_RELEASE_LABEL } from "../lib/app-release";
import { APP_BUILD } from "../lib/app-build";
import { Spinner } from "./Loading";
import "./feedback-form.css";
export default function FeedbackButton() {
  const { account } = useAuth(),
    [open, setOpen] = useState(false),
    eligible = account?.status === "approved";
  return (
    <>
      <button
        className="about-feedback-button"
        disabled={!eligible}
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus size={18} />
        Do you have a Suggestion/Bug to report?
      </button>
      {eligible && (
        <FeedbackForm
          key={account.uid}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function FeedbackForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef<{ key: string; id: string } | null>(null);
  const [kind, setKind] = useState("bug"),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    if (open) {
      setSent(false);
      setError("");
      if (element && !element.open) element.showModal();
    } else element?.close();
  }, [open]);
  useEffect(() => () => dialog.current?.close(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || sent) return;
    setError("");
    setBusy(true);
    const key = JSON.stringify([kind, title.trim(), description.trim()]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      const result = await apiRequest<{ sent: boolean }>("/api/feedback", {
        method: "POST",
        body: {
          kind,
          title: title.trim(),
          description: description.trim(),
          requestId: request.current.id,
          release: APP_RELEASE_LABEL,
          build: APP_BUILD,
          platform: isTauri() ? "Windows app" : "Website",
        },
      });
      if (!result.sent)
        throw Error("The report could not be confirmed. Please try again.");
      setSent(true);
      setTitle("");
      setDescription("");
      request.current = null;
      window.dispatchEvent(new Event("records-refresh-notifications"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your feedback could not be sent. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="feedback-dialog"
      aria-labelledby="feedback-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="feedback-eyebrow">THE RECORDS PROJECT</span>
          <h2 id="feedback-title">{sent ? "Thank you!" : "Send feedback"}</h2>
        </div>
        <button
          type="button"
          className="feedback-close"
          aria-label="Close feedback form"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </header>
      {sent ? (
        <div className="feedback-success">
          <CheckCircle2 size={34} />
          <p role="status">
            Your report was sent privately to Sumeitideas’s notifications.
          </p>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <p className="feedback-intro">
            Have an idea or found something that isn’t working? Send it directly
            to Sumeitideas.
          </p>
          <label>
            Report type
            <select
              value={kind}
              disabled={busy}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="bug">Bug report</option>
              <option value="suggestion">Suggestion</option>
            </select>
          </label>
          <label>
            Title
            <input
              required
              minLength={3}
              maxLength={120}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                kind === "bug"
                  ? "What went wrong?"
                  : "What would you like to improve?"
              }
            />
          </label>
          <label>
            Details
            <textarea
              required
              minLength={10}
              maxLength={4000}
              rows={6}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={
                kind === "bug"
                  ? "Tell us what happened, how to reproduce it, and what you expected."
                  : "Describe your idea and how it would help people."
              }
            />
          </label>
          <p className="feedback-context">
            Your signed-in username and app version are included so we can
            follow up.
          </p>
          {error && (
            <p className="feedback-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="feedback-submit" disabled={busy}>
              {busy ? <Spinner /> : <Send size={16} />}{" "}
              {busy ? "Sending…" : "Send feedback"}
            </button>
          </footer>
        </form>
      )}
    </dialog>,
    document.body,
  );
}
