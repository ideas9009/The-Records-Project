import { t } from "./lib/i18n";
import StructuredInput from "./StructuredInput";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { X, Search, ArrowUpRight, LoaderCircle, ImagePlus } from "lucide-react";
import { Row, arr, label, when } from "./lib/model";
import { upload } from "./lib/data";
import { external } from "./lib/native";
export type Context = {
  user: Row;
  go: (page: string) => void;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
};
export const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function Header({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow || "THE RECORDS PROJECT"}</div>
        <h1>{t(title)}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </header>
  );
}
export function State({
  loading,
  error,
  empty,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
}) {
  return error ? (
    <div className="error" role="alert">
      Could not load this section. {error}
    </div>
  ) : loading ? (
    <div className="empty">
      <LoaderCircle className="spin" /> Loading records…
    </div>
  ) : empty ? (
    <div className="empty">No records here yet.</div>
  ) : null;
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search records…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={16} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function Avatar({ row, size = 36 }: { row: Row; size?: number }) {
  return row.avatar_url ? (
    <img
      className="avatar"
      width={size}
      height={size}
      src={row.avatar_url}
      alt=""
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="avatar initials" style={{ width: size, height: size }}>
      {String(row.username || row.name || row.id)
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}
export function Link({
  url,
  children,
}: {
  url: string;
  children?: React.ReactNode;
}) {
  const { run } = useApp();
  return (
    <button className="link" onClick={() => run(() => external(url), "")}>
      {children || "Open link"}
      <ArrowUpRight size={14} />
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-header">
        <h2>{t(title)}</h2>
        <button aria-label="Close" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "textarea"
    | "checkbox"
    | "select"
    | "csv"
    | "json"
    | "image";
  options?: string[];
  required?: boolean;
  min?: number;
};
export function Editor({
  title,
  fields,
  initial = {},
  submit,
  close,
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, any>;
  submit: (v: Record<string, any>) => Promise<unknown>;
  close: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>(() =>
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          f.type === "csv"
            ? arr(initial[f.key]).join(", ")
            : f.type === "json"
              ? JSON.stringify(initial[f.key] ?? {}, null, 2)
              : (initial[f.key] ?? (f.type === "checkbox" ? false : "")),
        ]),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} close={() => !busy && close()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result: Record<string, any> = {};
            for (const f of fields) {
              let v = values[f.key];
              if (f.type === "number") {
                v = Number(v);
                if (!Number.isFinite(v) || (f.min !== undefined && v < f.min))
                  throw Error("Invalid " + f.label);
              }
              if (f.type === "csv")
                v = String(v)
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
              if (f.type === "json") v = JSON.parse(v);
              result[f.key] = v;
            }
            await submit(result);
            close();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          {fields.map((f) => (
            <div
              role="group"
              aria-label={f.label}
              key={f.key}
              className={
                ["textarea", "json", "image"].includes(f.type || "")
                  ? "wide"
                  : ""
              }
            >
              <span>{t(f.label)}</span>
              {f.type === "checkbox" ? (
                <input
                  aria-label={f.label}
                  type="checkbox"
                  checked={!!values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.checked })
                  }
                />
              ) : f.type === "select" ? (
                <select
                  aria-label={f.label}
                  required={f.required}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                >
                  <option value="">Select…</option>
                  {f.options?.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : f.type === "json" ? (
                <StructuredInput
                  name={f.key}
                  value={values[f.key]}
                  onChange={(v) => setValues({ ...values, [f.key]: v })}
                />
              ) : f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  rows={4}
                  value={values[f.key]}
                  required={f.required}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              ) : f.type === "image" ? (
                <>
                  <input
                    aria-label={f.label}
                    required={f.required}
                    value={values[f.key]}
                    placeholder="https://…"
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                  />
                  <span className="file-input">
                    <ImagePlus size={16} />
                    Upload image
                    <input
                      aria-label={"Upload " + f.label}
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        if (!e.target.files?.[0]) return;
                        setBusy(true);
                        try {
                          const url = await upload(e.target.files[0]);
                          setValues((v) => ({ ...v, [f.key]: url }));
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </span>
                </>
              ) : (
                <input
                  aria-label={f.label}
                  type={f.type === "number" ? "number" : "text"}
                  step="any"
                  min={f.min}
                  value={values[f.key]}
                  required={f.required}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              )}
            </div>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <footer className="modal-footer">
          <button type="button" disabled={busy} onClick={close}>
            {t("Cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Confirm({
  title,
  description,
  action,
  close,
}: {
  title: string;
  description: string;
  action: () => Promise<unknown>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} close={() => !busy && close()}>
      <p>{description}</p>
      {error && <div className="error">{error}</div>}
      <footer className="modal-footer">
        <button disabled={busy} onClick={close}>
          {t("Cancel")}
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await action();
              close();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : "Confirm"}
        </button>
      </footer>
    </Modal>
  );
}
export function Details({ row, fields }: { row: Row; fields: string[] }) {
  return (
    <dl className="details">
      {fields.map((k) => (
        <React.Fragment key={k}>
          <dt>{label(k)}</dt>
          <dd>
            {typeof row[k] === "object"
              ? Array.isArray(row[k])
                ? row[k].join(", ")
                : when(row[k])
              : String(row[k] ?? "—")}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
export function Stat({
  name,
  value,
  description,
}: {
  name: string;
  value: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="stat">
      <span>{t(name)}</span>
      <strong>{value}</strong>
      {description && <small>{description}</small>}
    </div>
  );
}
export function matches(row: Row, q: string, fields: string[]) {
  return fields.some((k) =>
    String(row[k] ?? "")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
}
