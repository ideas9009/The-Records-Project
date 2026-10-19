import { SyncStatus } from "../components/SmartSync";
import { LoadingStatus } from "../components/Loading";
import { apiRequest } from "../lib/api";
import RegisterTown from "./RegisterTown";
import { useAuth } from "../lib/auth-context";
import { useEffect, useRef, useState } from "react";
import TownGallery from "./TownGallery";
import { townTypeLabel, useTown } from "../lib/cloud-towns";
import { TownIcon, TownStatistics } from "./TownRegistry";
import "./TownRegistry.css";

export default function TownDetails({
  townId,
  onBack,
}: {
  townId: string;
  onBack: () => void;
}) {
  const [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(false);
  const [access, setAccess] = useState({
    canEdit: false,
    canManageMayors: false,
  });
  const { account } = useAuth();
  const { town, loading, error } = useTown(townId, revision);
  useEffect(() => {
    let active = true;
    setAccess({ canEdit: false, canManageMayors: false });
    void apiRequest<typeof access>("/api/towns/" + townId + "/edit", {
      networkOnly: true,
    })
      .then((value) => {
        if (active) setAccess(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [townId, revision, account]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [townId, town]);
  return (
    <div className="town-detail-page">
      <div className="town-page-actions">
        {!editing && (
          <button className="town-back" onClick={onBack}>
            <TownIcon name="arrow_back" />
            Town Registry
          </button>
        )}
        {!editing && access.canEdit && (
          <button className="town-edit" onClick={() => setEditing(true)}>
            <TownIcon name="edit" />
            Edit Town
          </button>
        )}
      </div>
      <SyncStatus path={"/api/towns/" + townId} />
      {editing && town ? (
        <RegisterTown
          town={town}
          canManageMayors={access.canManageMayors}
          onCancel={() => setEditing(false)}
          onCreated={() => {
            setEditing(false);
            setRevision((value) => value + 1);
          }}
        />
      ) : loading ? (
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
                  <dt>
                    {(town.mayorNames?.length || 1) > 1 ? "Mayors" : "Mayor"}
                  </dt>
                  <dd>{town.mayorNames?.join(", ") || town.mayor}</dd>
                </div>
                <div>
                  <dt>Town type</dt>
                  <dd>{townTypeLabel(town.type)}</dd>
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
