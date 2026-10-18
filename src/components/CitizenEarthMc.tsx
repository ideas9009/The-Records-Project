import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus } from "./Loading";
type EarthMc = {
  available: boolean;
  checkedAt: string;
  username?: string;
  town?: string | null;
  nation?: string | null;
  about?: string | null;
  title?: string | null;
  townRanks?: string[];
  nationRanks?: string[];
  balance?: number | null;
  online?: boolean | null;
  isMayor?: boolean;
  isKing?: boolean;
  joinedAt?: string | null;
  joinedTownAt?: string | null;
  lastOnline?: string | null;
};
const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Unavailable";
export default function CitizenEarthMc({ uid }: { uid: string }) {
  const [data, setData] = useState<EarthMc | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(true);
    setError("");
    apiRequest<EarthMc>(
      "/api/citizens/" + encodeURIComponent(uid) + "/earthmc",
      { networkOnly: true },
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load EarthMC information.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [uid, attempt]);
  const rankList = [
    ...(data?.isKing ? ["King"] : []),
    ...(data?.isMayor ? ["Mayor"] : []),
    ...(data?.nationRanks || []),
    ...(data?.townRanks || []),
  ];
  return (
    <section className="card citizen-earthmc">
      <div className="earthmc-profile-heading">
        <h2>EarthMC Profile</h2>
        <button
          disabled={loading}
          onClick={() => setAttempt((value) => value + 1)}
          aria-label="Refresh EarthMC profile"
        >
          <span className="material-symbol" aria-hidden="true">
            refresh
          </span>
        </button>
      </div>
      {loading && <LoadingStatus>Loading EarthMC profile...</LoadingStatus>}
      {error && <p role="alert">{error}</p>}
      {data && !data.available && (
        <p className="citizens-muted">
          No public EarthMC profile found for this TRP username. The player may
          have opted out of the API.
        </p>
      )}
      {data?.available && (
        <>
          {data.about && <p className="earthmc-about">{data.about}</p>}
          <dl className="citizen-facts earthmc-facts">
            {Object.entries({
              "Minecraft username": data.username,
              Status:
                data.online === true
                  ? "Online"
                  : data.online === false
                    ? "Offline"
                    : "Unavailable",
              Town: data.town || "No town",
              Nation: data.nation || "No nation",
              "EarthMC ranks": [...new Set(rankList)].join(" / ") || "None",
              Title: data.title || "None",
              "Bank balance":
                data.balance == null
                  ? "Unavailable"
                  : data.balance.toLocaleString() + " Gold",
              "Joined EarthMC": date(data.joinedAt),
              "Joined town": date(data.joinedTownAt),
              "Last online": date(data.lastOnline),
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="citizens-muted">
            Username lookup. TRP roles are managed separately.
          </p>
        </>
      )}
      {data && <p className="citizens-muted">Updated {date(data.checkedAt)}</p>}
    </section>
  );
}
