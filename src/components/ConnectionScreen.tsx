import AuthWallpapers from "./AuthWallpapers";
import { Spinner } from "./Loading";
import {
  connectionStages,
  type ConnectionStage,
} from "../lib/connection-progress";
import "./connection-screen.css";
export default function ConnectionScreen({
  stage = "waiting",
  error = "",
  onRetry,
}: {
  stage?: ConnectionStage;
  error?: string;
  onRetry?: () => void;
}) {
  const progress = connectionStages[stage];
  return (
    <div className="app connection-screen auth-screen">
      <AuthWallpapers />
      <section className="connection-content" aria-label="Connection status">
        <div className="connection-heading">
          {error ? (
            <span className="material-symbol" aria-hidden="true">
              cloud_off
            </span>
          ) : (
            <Spinner />
          )}
          <span>{error ? "Couldn’t connect" : "Connecting…"}</span>
        </div>
        {error ? (
          <>
            <p className="connection-error" role="alert">
              {error}
            </p>
            <p className="connection-help">
              The server may be restarting. Please wait a few minutes. If it still doesn’t connect, please inform @sumeitideas on Discord.
            </p>
            <button onClick={onRetry}>Retry connection</button>
          </>
        ) : (
          <>
            <p className="connection-detail" role="status" aria-live="polite">
              {progress.detail}
            </p>
            <div
              className="connection-progress"
              role="progressbar"
              aria-label="Connection progress"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={progress.completed}
              aria-valuetext={progress.detail}
            >
              <span style={{ width: (progress.completed / 4) * 100 + "%" }} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
