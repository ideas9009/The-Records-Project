import { useState } from "react";
import { label } from "./lib/model";
function Primitive({
  value,
  onChange,
  name,
}: {
  value: any;
  onChange: (v: any) => void;
  name: string;
}) {
  if (typeof value === "boolean")
    return (
      <input
        aria-label={name}
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  if (typeof value === "object" && value !== null)
    return (
      <div className="nested-fields">
        {Object.entries(value).map(([k, v]) => (
          <label key={k}>
            {label(k)}
            <Primitive
              name={name + " " + k}
              value={v}
              onChange={(next) => onChange({ ...value, [k]: next })}
            />
          </label>
        ))}
      </div>
    );
  return (
    <input
      aria-label={name}
      type={typeof value === "number" ? "number" : "text"}
      step="any"
      value={value ?? ""}
      onChange={(e) =>
        onChange(
          typeof value === "number" ? Number(e.target.value) : e.target.value,
        )
      }
    />
  );
}
export default function StructuredInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  let data: any;
  try {
    data = JSON.parse(value);
  } catch {
    data = name === "products" ? [] : {};
  }
  if (name === "products" && !Array.isArray(data)) data = [];
  const array = Array.isArray(data),
    entries = Object.entries(data || {});
  const update = (key: string, v: any) => {
    const next = array ? [...data] : { ...data };
    next[key as any] = v;
    onChange(JSON.stringify(next));
  };
  const drop = (key: string) => {
    const next = array
      ? data.filter((_: any, i: number) => i !== Number(key))
      : { ...data };
    if (!array) delete next[key];
    onChange(JSON.stringify(next));
  };
  return (
    <div className="structured-editor">
      {entries.map(([key, v]) => (
        <div className="structured-row" key={key}>
          <strong>{array ? "Product " + (Number(key) + 1) : key}</strong>
          <Primitive
            name={key}
            value={v}
            onChange={(next) => update(key, next)}
          />
          <button type="button" onClick={() => drop(key)}>
            Remove
          </button>
        </div>
      ))}
      <div className="actions">
        {!array && (
          <input
            aria-label={"New " + name + " entry"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={
              name === "plots"
                ? "Plot identifier"
                : name === "hunters"
                  ? "Minecraft username"
                  : "Entry name"
            }
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (array)
              onChange(
                JSON.stringify([
                  ...data,
                  { name: "New product", price: 1, color: 4287664278 },
                ]),
              );
            else if (
              newKey.trim() &&
              !Object.hasOwn(data, newKey.trim()) &&
              !["__proto__", "constructor", "prototype"].includes(newKey.trim())
            ) {
              update(
                newKey.trim(),
                name === "hunters"
                  ? { permanent: true, expires_at: null }
                  : name === "taxes"
                    ? 0
                    : "",
              );
              setNewKey("");
            }
          }}
        >
          Add {array ? "product" : "entry"}
        </button>
      </div>
    </div>
  );
}
