import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/auth-context";
import { canAccessPage } from "../lib/access";
import {
  canUseDeveloperTools,
  developerScreens,
  developerPages,
  developerDetails,
  type DeveloperScreen,
} from "../lib/developer-tools";
import type { ManualProfile } from "../lib/manual-registration";
import Login from "./Login";
import { RegistrationStatus } from "./Registration";
import { MicrosoftConfirmation } from "../components/MicrosoftVerification";
import ConnectionScreen from "../components/ConnectionScreen";
import "./DeveloperTools.css";

const sample: ManualProfile = {
  username: "ExampleMayor",
  minecraftUuid: "00000000-0000-4000-8000-000000000001",
  isMayor: true,
  isCapital: false,
  town: {
    name: "ExampleTown",
    uuid: "preview-town",
    mayorName: "ExampleMayor",
    mayorUuid: "preview-mayor",
  },
  nation: { name: "Byzantium", uuid: "preview-nation" },
  ranks: [],
  balance: 125,
  townBalance: 850,
  townRegistered: true,
  mayorRegistered: true,
};
export function DeveloperScreenPreview({
  screen,
  onScreen,
}: {
  screen: DeveloperScreen;
  onScreen: (screen: DeveloperScreen) => void;
}) {
  const citizen =
    screen === "register-citizen" ||
    screen === "register-waiting" ||
    screen === "waiting";
  const profile = {
    ...sample,
    ...(citizen
      ? { username: "ExampleCitizen", isMayor: false, townBalance: null }
      : {}),
    ...(screen === "register-waiting" || screen === "waiting"
      ? { townRegistered: false, mayorRegistered: false }
      : {}),
  };
  if (screen === "login" || screen.startsWith("register-"))
    return (
      <Login
        key={screen}
        initialMode={screen === "login" ? "login" : "register"}
        preview={{
          onSignIn: () => onScreen("complete"),
          registration: {
            stage:
              screen === "login" || screen === "register-lookup"
                ? "lookup"
                : screen === "register-password"
                  ? "password"
                  : "confirm",
            profile,
            onComplete: () => onScreen("pending"),
          },
        }}
      />
    );
  if (screen === "pending" || screen === "waiting" || screen === "complete")
    return (
      <RegistrationStatus
        previewAccount={{
          uid: "developer-preview-only",
          username: profile.username,
          role: "member",
          status: screen === "complete" ? "approved" : "pending",
          createdAt: "2026-10-22T00:00:00Z",
          registrationMethod: "manual-emc",
          registration: profile,
          registrationWaiting:
            screen === "waiting"
              ? "Waiting for ExampleMayor to join and ExampleTown to be approved."
              : undefined,
        }}
      />
    );
  if (screen === "loading") return <ConnectionScreen stage="waiting" />;
  if (screen === "connection-error")
    return (
      <ConnectionScreen
        stage="waiting"
        error="Could not connect to The Records Project."
        onRetry={() => onScreen("loading")}
      />
    );
  return (
    <div className="app login-screen">
      <section className="card login-card">
        <h1>The Records Project</h1>
        <h2>Confirm your Minecraft profile</h2>
        <MicrosoftConfirmation
          ready={{
            status: "ready",
            mode: "link",
            confirmationDigest: "preview-only",
            profile: { ...sample, avatar: null, townRegistered: true },
          }}
        />
        <button disabled>Confirm and link (preview)</button>
      </section>
    </div>
  );
}

function PreviewDialog({
  screen,
  onScreen,
  onClose,
}: {
  screen: DeveloperScreen;
  onScreen: (screen: DeveloperScreen) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="developer-preview"
      onCancel={onClose}
      aria-labelledby="developer-preview-title"
    >
      <header className="developer-preview-toolbar">
        <div>
          <strong id="developer-preview-title">Developer preview</strong>
          <small>Sample data · Your session is unchanged</small>
        </div>
        <label>
          <span className="sr-only">Preview screen</span>
          <select
            aria-label="Preview screen"
            value={screen}
            onChange={(e) => onScreen(e.target.value as DeveloperScreen)}
          >
            {developerScreens.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button autoFocus onClick={onClose}>
          Exit preview
        </button>
      </header>
      <div className="developer-preview-content" key={screen}>
        <DeveloperScreenPreview screen={screen} onScreen={onScreen} />
      </div>
    </dialog>,
    document.body,
  );
}
export default function DeveloperTools({
  go,
}: {
  go?: (page: string) => void;
}) {
  const { account } = useAuth();
  const [screen, setScreen] = useState<DeveloperScreen | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<string>("town:");
  const [id, setId] = useState("");
  if (!canUseDeveloperTools(account)) return null;
  const matches = (label: string) =>
    label.toLowerCase().includes(search.trim().toLowerCase());
  return (
    <div className="developer-tools">
      <section className="card">
        <h2>Developer Tools</h2>
        <p>
          Open screens that are normally reached during sign-in, registration or
          other flows.
        </p>
        <label>
          Find a screen
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search screens and pages"
          />
        </label>
      </section>
      <section className="card">
        <h2>Screen previews</h2>
        <p>
          Interactive sample screens. Nothing is submitted and your account
          stays signed in. Use a sample password when trying the registration
          flow.
        </p>
        <div className="developer-tool-grid">
          {developerScreens
            .filter(([, label]) => matches(label))
            .map(([key, label]) => (
              <button key={key} onClick={() => setScreen(key)}>
                <span className="material-symbol" aria-hidden="true">
                  preview
                </span>
                {label}
              </button>
            ))}
        </div>
      </section>
      <section className="card">
        <h2>Open app pages</h2>
        <p>
          These open the real pages with your usual permissions. Publishing and
          saving work normally.
        </p>
        <div className="developer-tool-grid">
          {developerPages
            .filter(
              ([route, label]) =>
                matches(label) && canAccessPage(account, route),
            )
            .map(([route, label]) => (
              <button key={route} disabled={!go} onClick={() => go?.(route)}>
                {label}
                <span className="material-symbol" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            ))}
        </div>
      </section>
      <section className="card">
        <h2>Open a specific record</h2>
        <p>
          Use the record ID to open an existing detail, edit or conversation
          page.
        </p>
        <form
          className="developer-record-form"
          onSubmit={(e) => {
            e.preventDefault();
            const route = detail + id.trim();
            if (id.trim() && canAccessPage(account, route)) go?.(route);
          }}
        >
          <label>
            Page
            <select value={detail} onChange={(e) => setDetail(e.target.value)}>
              {developerDetails.map(([prefix, label]) => (
                <option key={prefix} value={prefix}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Record ID
            <input
              required
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Paste the record ID"
            />
          </label>
          <button
            disabled={
              !go || !id.trim() || !canAccessPage(account, detail + id.trim())
            }
          >
            Open page
          </button>
        </form>
      </section>
      {screen && (
        <PreviewDialog
          screen={screen}
          onScreen={setScreen}
          onClose={() => setScreen(null)}
        />
      )}
    </div>
  );
}
