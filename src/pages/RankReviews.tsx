import { useEffect, useState } from "react";
import { apiRequest, watchResource } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { canManageRoles, roleNames, type Role } from "../lib/access";
import { LoadingStatus } from "../components/Loading";
import ExpandingConfirmation from "../components/ExpandingConfirmation";
type Review = {
  id: string;
  username: string;
  town: string | null;
  version: number;
  unknownRanks: { key: string; rank: string; source: string }[];
};
export default function RankReviews() {
  const { account } = useAuth(),
    [reviews, setReviews] = useState<Review[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [choices, setChoices] = useState<Record<string, Record<string, Role>>>({}),
    [confirm, setConfirm] = useState<{
      anchor: HTMLElement;
      review: Review;
    } | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setError("");
    setLoading(true);
    return watchResource<Review[]>(
      "/api/admin/rank-reviews",
      (items) => {
        setReviews(items);
        setLoading(false);
        setError("");
      },
      (reason) => {
        setReviews([]);
        setLoading(false);
        setError(reason.message);
      },
    );
  }, [revision]);
  async function resolve() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(
        "/api/admin/rank-reviews/" + confirm.review.id + "/resolve",
        {
          method: "POST",
          body: {
            version: confirm.review.version,
            mappings: choices[confirm.review.id],
          },
        },
      );
      setConfirm(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve ranks.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Rank Review</h2>
      {loading && <LoadingStatus>Loading rank reviews…</LoadingStatus>}
      {error && !confirm && <p role="alert">{error}</p>}
      {!loading && !reviews.length && !error && (
        <p>No ranks awaiting review.</p>
      )}
      {reviews.map((review) => (
        <div className="rank-review" key={review.id}>
          <h3>{review.username}</h3>
          {review.town && <p>{review.town}</p>}
          <div className="rank-review-fields">
            {review.unknownRanks.map((rank) => (
              <label key={rank.key}>
                <span>
                  {rank.rank}
                  <small>
                    {rank.source === "nation"
                      ? "Nation rank"
                      : rank.source === "town"
                        ? "Town rank"
                        : "Title"}
                  </small>
                </span>
                {canManageRoles(account) ? (
                  <select
                    aria-label={"Map " + rank.rank + " for " + review.username}
                    value={choices[review.id]?.[rank.key] || ""}
                    onChange={(e) =>
                      setChoices((old) => ({
                        ...old,
                        [review.id]: {
                          ...old[review.id],
                          [rank.key]: e.target.value as Role,
                        },
                      }))
                    }
                  >
                    <option value="">Select role</option>
                    {Object.entries(roleNames)
                      .filter(([role]) => !["operator", "mayor"].includes(role))
                      .map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span>Awaiting Operator, Leader or Prime Minister</span>
                )}
              </label>
            ))}
          </div>
          {canManageRoles(account) && (
            <button
              disabled={
                busy ||
                review.unknownRanks.some(
                  (rank) => !choices[review.id]?.[rank.key],
                )
              }
              onClick={(e) => {
                setError("");
                setConfirm({ anchor: e.currentTarget, review });
              }}
            >
              Confirm roles
            </button>
          )}
        </div>
      ))}
      <ExpandingConfirmation
        anchor={confirm?.anchor || null}
        title="Confirm rank mapping?"
        message={
          "Apply the selected roles to " + confirm?.review.username + "?"
        }
        triggerLabel="Confirm roles"
        confirmText="Apply roles"
        busy={busy}
        error={error}
        onCancel={() => {
          setConfirm(null);
          setError("");
        }}
        onConfirm={() => void resolve()}
      />
    </section>
  );
}
