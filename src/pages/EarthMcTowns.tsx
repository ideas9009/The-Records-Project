import EarthMcRecordPdfExport from "../components/EarthMcRecordPdfExport";
import EarthMcTownDetails from "../components/EarthMcTownDetails";
import {
  earthMcPageSizes,
  readEarthMcPageSize,
  rememberEarthMcPageSize,
  type EarthMcPageSize,
} from "../lib/earthmc-page-size";
import PageCapture from "../components/PageCapture";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import { LoadingStatus } from "../components/Loading";
import "./Citizens.css";
import "./EarthMcPeople.css";
type Place = { name: string; uuid: string };
type Directory = { towns: Place[]; nations: Place[]; checkedAt: string };
export default function EarthMcTowns({
  townId,
  onOpen,
  onBack,
  onRegistry,
  onPlayer,
}: {
  townId?: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRegistry: () => void;
  onPlayer: (id: string) => void;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [list, setList] = useState<Place[]>([]),
    [nation, setNation] = useState("all"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<{
      town: Record<string, unknown>;
      checkedAt: string;
    } | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [detailAttempt, setDetailAttempt] = useState(0);
  const [pageSize, setPageSize] = useState<EarthMcPageSize>(() =>
    readEarthMcPageSize(localStorage),
  );
  const captureTarget = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [townId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiRequest<Directory>("/api/earthmc/town-directory", { networkOnly: true })
      .then((result) => {
        if (active) setDirectory(result);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!directory) return;
    let active = true;
    setList([]);
    setPage(0);
    setError("");
    if (nation === "all") {
      setList(directory.towns);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiRequest<{ towns: Place[] }>(
      "/api/earthmc/nations/" + encodeURIComponent(nation) + "/towns",
      { networkOnly: true },
    )
      .then((result) => {
        if (active) setList(result.towns);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [directory, nation]);
  useEffect(() => {
    if (!townId) return;
    let active = true;
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    apiRequest<{ town: Record<string, unknown>; checkedAt: string }>(
      "/api/earthmc/towns/" + encodeURIComponent(townId),
      { networkOnly: true },
    )
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((reason) => {
        if (active) setDetailError(reason.message);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [townId, detailAttempt]);
  const filtered = useMemo(
    () =>
      list.filter((place) =>
        place.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [list, search],
  );
  const limit = typeof pageSize === "number" ? pageSize : 20;
  const pages = Math.max(1, Math.ceil(filtered.length / limit)),
    current = Math.min(page, pages - 1);
  if (townId)
    return (
      <div
        className="citizens-page earthmc-people earthmc-towns"
        ref={captureTarget}
      >
      <header className="page-header page-banner">
        <button className="citizens-back" onClick={onBack}>
          <span className="material-symbol" aria-hidden="true">
            arrow_back
          </span>
          EarthMC towns
        </button>
          <div className="minecraft-identity">
            <span className="citizen-avatar" aria-hidden="true">
              <span className="material-symbol">location_city</span>
            </span>
            <h1 ref={heading} tabIndex={-1}>
              {typeof detail?.town.name === "string"
                ? detail.town.name
                : "EarthMC Town"}
            </h1>
          </div>
          <div className="page-header-actions" data-capture-exclude>
            <button
              disabled={detailLoading}
              onClick={() => setDetailAttempt((value) => value + 1)}
            >
              Refresh
            </button>
            <EarthMcRecordPdfExport kind="town" record={detail?.town} checkedAt={detail?.checkedAt} disabled={detailLoading || !detail}/>
          </div>
        </header>
        {detailLoading && (
          <LoadingStatus>Loading EarthMC town...</LoadingStatus>
        )}
        {detailError && (
          <section className="card">
            <p role="alert">{detailError}</p>
            <button onClick={() => setDetailAttempt((value) => value + 1)}>
              Try again
            </button>
          </section>
        )}
        {detail && (
          <>
            <EarthMcTownDetails
              key={townId}
              townId={townId}
              town={detail.town}
              onPlayer={onPlayer}
            />
            <p className="citizens-muted earthmc-updated">
              Updated {new Date(detail.checkedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    );
  return (
    <div
      className="citizens-page earthmc-people earthmc-towns"
      ref={captureTarget}
    >
      <header className="page-header page-banner">
      <button className="citizens-back" onClick={onRegistry}>
        <span className="material-symbol" aria-hidden="true">
          arrow_back
        </span>
        Town Registry
      </button>
        <h1 ref={heading} tabIndex={-1}>
          Towns on EarthMC
        </h1>
        <div className="page-header-actions" data-capture-exclude>
          <button
            disabled={loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Refresh
          </button>
          <PageCapture
            target={captureTarget}
            title="EarthMC-towns"
            disabled={loading || !directory}
          />
        </div>
      </header>
      <div className="citizens-toolbar">
        <label className="citizens-search">
          <span className="material-symbol" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label="Search EarthMC towns"
            placeholder="Search EarthMC towns"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="earthmc-nation-filter">
          <span>Nation</span>
          <select
            aria-label="Filter EarthMC towns by nation"
            value={nation}
            onChange={(event) => setNation(event.target.value)}
          >
            <option value="all">All towns</option>
            {directory?.nations.map((item) => (
              <option key={item.uuid} value={item.uuid}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="earthmc-nation-filter">
          <span>Show</span>
          <select
            aria-label="Towns per page"
            value={pageSize}
            onChange={(event) => {
              const value =
                event.target.value === "full"
                  ? "full"
                  : (Number(event.target.value) as EarthMcPageSize);
              rememberEarthMcPageSize(localStorage, value);
              setPage(0);
              setPageSize(value);
            }}
          >
            {earthMcPageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        {directory?.nations.some(
          (item) => item.name.toLowerCase() === "byzantium",
        ) && (
          <button
            onClick={() =>
              setNation(
                directory.nations.find(
                  (item) => item.name.toLowerCase() === "byzantium",
                )!.uuid,
              )
            }
          >
            Byzantium towns
          </button>
        )}
      </div>

      {loading && <LoadingStatus>Loading EarthMC towns...</LoadingStatus>}
      {error && (
        <section className="card">
          <p role="alert">{error}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </section>
      )}
      {!loading && !error && (
        <>
          <p className="citizens-muted" role="status">
            {filtered.length.toLocaleString()} towns / Page {current + 1} of{" "}
            {pages}
          </p>
          <div className="citizens-grid">
            {filtered
              .slice(current * limit, (current + 1) * limit)
              .map((place) => (
                <button
                  className="card citizen-card"
                  key={place.uuid}
                  onClick={() => onOpen(place.uuid)}
                  aria-label={"View EarthMC town " + place.name}
                >
                  <span className="citizen-avatar" aria-hidden="true">
                    <span className="material-symbol">location_city</span>
                  </span>
                  <div className="citizen-card-info">
                    <h2>{place.name}</h2>
                  </div>
                  <span className="material-symbol" aria-hidden="true">
                    arrow_forward
                  </span>
                </button>
              ))}
          </div>
          {!filtered.length && (
            <section className="card citizens-empty">
              No matching towns.
            </section>
          )}
          <div
            role="navigation"
            className="earthmc-pagination"
            aria-label="EarthMC town pages"
          >
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      <p className="citizens-muted">Public town information from EarthMC.</p>
    </div>
  );
}
