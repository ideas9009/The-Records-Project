import { SyncStatus } from "../components/SmartSync";
import { LoadingStatus } from "../components/Loading";
import { useEffect, useRef } from "react";
import TownGallery from "./TownGallery";
import { useTown } from "../lib/cloud-towns";
import { TownIcon, TownStatistics } from "./TownRegistry";
import "./TownRegistry.css";

export default function TownDetails({
  townId,
  onBack,
}: {
  townId: string;
  onBack: () => void;
}) {
  const { town, loading, error } = useTown(townId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [townId, town]);
  return (
    <div className="town-detail-page">
      <button className="town-back" onClick={onBack}>
        <TownIcon name="arrow_back" />
        Town Registry
      </button>
      <SyncStatus path={"/api/towns/" + townId} />
      {loading ? (
        <LoadingStatus>Loading town…</LoadingStatus>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !town ? (
        <section className="card">
          <h1 ref={heading} tabIndex={-1}>
            Town not found
          </h1>
        </section>
      ) : (
        <>
          <header className="card town-detail-hero">
            <img
              className="town-cover"
              src={town.image}
              alt=""
              decoding="async"
            />
            <div>
              <h1 ref={heading} tabIndex={-1}>
                {town.name}
              </h1>
            </div>
            {town.testData && (
              <span className="town-test-label">Test data</span>
            )}
          </header>
          <div className="town-detail-grid">
            <section className="card">
              <h2>Town information</h2>
              <dl className="town-facts">
                <div>
                  <dt>Mayor</dt>
                  <dd>{town.mayor}</dd>
                </div>
              </dl>
              <TownStatistics town={town} />
            </section>
            <section className="card">
              <h2>Residents in The Records Project</h2>
              <ul className="town-residents">
                {town.registeredResidents.map((name) => (
                  <li key={name}>
                    <TownIcon name="person" />
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <TownGallery key={town.id} town={town} />
          {town.testData && (
            <p className="town-test-note">
              Sample record. Resident counts and claimed chunks are test values.
            </p>
          )}
        </>
      )}
    </div>
  );
}
