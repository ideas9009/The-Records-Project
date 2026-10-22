import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { watchResource } from "../lib/api";
import { accountRoles, roleNames } from "../lib/access";
import { signOutCloud, firebaseError } from "../lib/cloud-auth";
import type { Citizen } from "../lib/citizens";
import { PREVIEW_MODE } from "../lib/runtime-mode";
import MinecraftFace from "../components/MinecraftFace";
import MicrosoftVerification from "../components/MicrosoftVerification";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
import { LoadingStatus } from "../components/Loading";
import "./MyProfile.css";
const Icon = ({ name }: { name: string }) => (
  <span className="material-symbol" aria-hidden="true">
    {name}
  </span>
);
export default function MyProfile({ go }: { go?: (page: string) => void }) {
  const { account } = useAuth();
  const [citizen, setCitizen] = useState<Citizen | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [logoutAnchor, setLogoutAnchor] = useState<HTMLElement | null>(null),
    [loggingOut, setLoggingOut] = useState(false),
    [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    setCitizen(null);
    setError("");
    if (!account || account.status !== "approved" || PREVIEW_MODE) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return watchResource<Citizen>(
      "/api/citizens/" + encodeURIComponent(account.uid),
      (value) => {
        setCitizen(value);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setError(reason.message);
        setLoading(false);
      },
    );
  }, [account?.uid, account?.status, attempt]);
  if (!account || account.status !== "approved") return null;
  const towns = citizen?.towns || [],
    joined = citizen?.joinedAt || account.createdAt;
  const joinedDate =
    joined && Number.isFinite(Date.parse(joined))
      ? new Date(joined).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : "Not recorded";
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await signOutCloud();
    } catch (reason) {
      setLogoutError(firebaseError(reason));
      setLoggingOut(false);
    }
  }
  return (
    <div className="my-profile">
      <header className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Your place in The Records Project.</p>
        </div>
        {go && (
          <button onClick={() => go("citizen:" + account.uid)}>
            <Icon name="open_in_new" />
            View public profile
          </button>
        )}
      </header>
      <section className="card profile-hero" aria-label="Your profile summary">
        <div className="profile-hero-copy">
          <span className="profile-eyebrow">
            BYZANTIUM · THE RECORDS PROJECT
          </span>
          <h2>{account.username}</h2>
          <div className="profile-badges">
            <span className="profile-identity-status">
              <Icon name="check_circle" />
              Approved member
            </span>
            {account.minecraftVerified && (
              <span className="profile-identity-status">
                <Icon name="verified_user" />
                Microsoft linked
              </span>
            )}
          </div>
          <div className="profile-roles" aria-label="Your roles">
            {accountRoles(account).map((role) => (
              <span key={role}>{roleNames[role]}</span>
            ))}
          </div>
          <dl className="profile-quick-facts">
            <div>
              <dt>Member since</dt>
              <dd>{joinedDate}</dd>
            </div>
            <div>
              <dt>Registered towns</dt>
              <dd>{citizen ? towns.length : loading ? "Loading…" : "—"}</dd>
            </div>
            <div>
              <dt>Account connection</dt>
              <dd>
                {account.minecraftVerified ? "Microsoft + TRP" : "TRP account"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="profile-character">
          <div className="profile-character-halo" />
          <MinecraftFace username={account.username} variant="body" eager />
          <span>Your Minecraft character</span>
        </div>
      </section>
      <div className="profile-columns">
        <div className="profile-column">
          <section
            className="card profile-section"
            aria-labelledby="profile-towns-title"
          >
            <header className="profile-section-heading">
              <span className="profile-section-icon">
                <Icon name="location_city" />
              </span>
              <div>
                <h2 id="profile-towns-title">Your towns</h2>
                <p>The communities you belong to in TRP.</p>
              </div>
            </header>
            {loading ? (
              <LoadingStatus>Finding your towns…</LoadingStatus>
            ) : error ? (
              <div className="profile-inline-error">
                <p role="alert">{error}</p>
                <button onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              </div>
            ) : towns.length ? (
              <div className="profile-town-list">
                {towns.map((town) => (
                  <div key={town.id} className="profile-town-row">
                    <span className="profile-town-icon">
                      <Icon
                        name={
                          town.mayor ? "account_balance" : "holiday_village"
                        }
                      />
                    </span>
                    <div>
                      <h3>{town.name}</h3>
                      <span>{town.mayor ? "Mayor" : "Resident"}</span>
                    </div>
                    {go && (
                      <button
                        aria-label={"Open " + town.name}
                        onClick={() => go("town:" + town.id)}
                      >
                        <Icon name="arrow_forward" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="profile-empty">
                {account.earthmcTownName
                  ? "Your EMC town is " +
                    account.earthmcTownName +
                    ". Your TRP town membership will appear here once it is registered and linked."
                  : "Your registered town memberships will appear here."}
              </p>
            )}
            {account.townRegistrationPending && (
              <p className="profile-notice">
                Your EMC town is awaiting registration by its verified mayor.
              </p>
            )}
          </section>
          <section
            className="card profile-section"
            aria-labelledby="profile-details-title"
          >
            <header className="profile-section-heading">
              <span className="profile-section-icon">
                <Icon name="badge" />
              </span>
              <div>
                <h2 id="profile-details-title">Profile details</h2>
                <p>Your identity in the community.</p>
              </div>
            </header>
            <dl className="profile-details">
              <div>
                <dt>TRP username</dt>
                <dd>{account.username}</dd>
              </div>
              <div>
                <dt>Nation</dt>
                <dd>Byzantium</dd>
              </div>
              <div>
                <dt>Membership</dt>
                <dd>Approved</dd>
              </div>
              <div>
                <dt>Minecraft identity</dt>
                <dd>
                  {account.minecraftVerified
                    ? "Verified through Microsoft"
                    : account.emcIdentityReviewed
                      ? "Reviewed by TRP"
                      : "Microsoft not linked"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <div className="profile-column">
          <section
            className="card profile-section profile-connections"
            aria-labelledby="profile-connections-title"
          >
            <header className="profile-section-heading">
              <span className="profile-section-icon">
                <Icon name="link" />
              </span>
              <div>
                <h2 id="profile-connections-title">Connected accounts</h2>
                <p>Keep your Minecraft identity connected.</p>
              </div>
            </header>
            <div
              className={
                "profile-microsoft " +
                (account.minecraftVerified ? "is-linked" : "")
              }
            >
              <div className="profile-connection-heading">
                <span className="profile-microsoft-logo" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <h3>Microsoft</h3>
                <span className="profile-connection-tag">
                  {account.minecraftVerified ? "Linked" : "Recommended"}
                </span>
              </div>
              {account.minecraftVerified ? (
                <p>
                  <Icon name="verified_user" />
                  Your Minecraft identity is verified. You can sign in to TRP
                  with Microsoft.
                </p>
              ) : (
                <>
                  <p>
                    Already have a TRP account? Link Microsoft to verify your
                    Minecraft identity and enable Microsoft sign-in.
                  </p>
                  <MicrosoftVerification mode="link" />
                </>
              )}
            </div>
            <div className="profile-discord">
              <div>
                <h3>Discord</h3>
                <p>Connect with your community.</p>
              </div>
              <span className="profile-soon-tag">Coming soon</span>
            </div>
          </section>
          <section
            className="card profile-section"
            aria-labelledby="profile-access-title"
          >
            <header className="profile-section-heading">
              <span className="profile-section-icon">
                <Icon name="lock" />
              </span>
              <div>
                <h2 id="profile-access-title">Account access</h2>
                <p>Your sign-in and security settings.</p>
              </div>
            </header>
            <div className="profile-access-row">
              <div>
                <h3>TRP password</h3>
                <p>Manage the password you use to sign in.</p>
              </div>
              {go && (
                <button onClick={() => go("settings:account")}>
                  Manage
                  <Icon name="arrow_forward" />
                </button>
              )}
            </div>
            <div className="profile-access-row">
              <div>
                <h3>Sign out</h3>
                <p>Leave this session on this device.</p>
              </div>
              <button
                className="profile-signout"
                onClick={(event) => {
                  setLogoutError("");
                  setLogoutAnchor(event.currentTarget);
                }}
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      </div>
      <aside className="profile-customization">
        <span className="profile-section-icon">
          <Icon name="palette" />
        </span>
        <div>
          <h2>A profile that feels like you</h2>
          <p>
            Custom covers, bios and more profile personalization are planned for
            Phase 2.
          </p>
        </div>
        <span className="profile-soon-tag">Coming next</span>
      </aside>
      <ExpandingConfirmation
        anchor={logoutAnchor}
        title="Sign out?"
        message="You can sign in again with your TRP password or a linked Microsoft account."
        triggerLabel="Sign out"
        triggerIcon="logout"
        confirmText="Sign out"
        busy={loggingOut}
        error={logoutError}
        onCancel={() => setLogoutAnchor(null)}
        onConfirm={() => void logout()}
      />
    </div>
  );
}
