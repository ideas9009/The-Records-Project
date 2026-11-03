import AuthWallpapers from "./AuthWallpapers";
import AuthTips from "./AuthTips";
import type { ConnectionStage } from "../lib/connection-progress";
import "./connection-screen.css";
export default function ConnectionScreen({
  error = "",
  onRetry,
}: {
  stage?: ConnectionStage;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="app connection-screen auth-screen">
      <AuthWallpapers />
      <section
        className={
          "connection-content" + (error ? "" : " connection-loading-content")
        }
        aria-label="Connection status"
      >
        {error ? (
          <>
            <div className="connection-heading">
              <span className="material-symbol" aria-hidden="true">
                cloud_off
              </span>
              <span>Couldn’t connect</span>
            </div>
            <p className="connection-error" role="alert">
              {error}
            </p>
            <p className="connection-help">
              The server may be restarting. Please wait a few minutes. If it
              still doesn’t connect, please inform @sumeitideas on Discord.
            </p>
            <button onClick={onRetry}>Retry connection</button>
          </>
        ) : (
          <div
            className="connection-loader"
            role="status"
            aria-label="Loading your session"
          >
            <div className="connection-loader-art" aria-hidden="true">
              <svg viewBox="0 0 80 80">
                <circle
                  className="connection-ring-track"
                  cx="40"
                  cy="40"
                  r="34"
                />
                <circle
                  className="connection-orbit-outer"
                  cx="40"
                  cy="40"
                  r="34"
                />
                <circle
                  className="connection-orbit-inner"
                  cx="40"
                  cy="40"
                  r="25"
                />
              </svg>
              <img src="/trp-logo.png" alt="" />
            </div>
          </div>
        )}
      </section>
      <AuthTips />
    </div>
  );
}
