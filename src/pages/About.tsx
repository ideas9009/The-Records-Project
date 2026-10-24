import { AboutUpdater } from "../components/DesktopUpdater";
import ReleaseNotes from "../components/ReleaseNotes";
import { APP_RELEASE_LABEL } from "../lib/app-release";
import "./Changelog.css";
import releaseNotes from "../../RELEASE-NOTES.md?raw";
export default function About({ go }: { go?: (page: string) => void } = {}) {
  return (
    <div className="about-page">
      <header className="page-header page-banner">
        <div>
          <h1>About</h1>
          <p>The Records Project</p>
        </div>
      </header>
      <section
        className="card about-management"
        aria-label="Project management"
      >
        <div className="about-management-brand">
          <svg
            viewBox="296 381 1408 1239"
            aria-hidden="true"
            width="48"
            height="48"
          >
            <image href="/trp-logo.png" width="2000" height="2000" />
          </svg>
          <h2>The Records Project</h2>
        </div>
        <div className="about-management-credit">
          <span>managed by</span>
          <img
            src="/branding/byzantine-republic.svg"
            alt="The Byzantine Republic"
            width="360"
            height="73"
          />
        </div>
      </section>
      <section className="card about-version" aria-label="App version">
        <h2>{APP_RELEASE_LABEL}</h2>
        {go && (
          <button onClick={() => go("changelog")}>
            <span className="material-symbol" aria-hidden="true">
              history
            </span>
            Changelog
          </button>
        )}
      </section>
      <AboutUpdater />
      <section className="card release-notes">
        <h2>Phase 2 release notes</h2>
        <ReleaseNotes notes={releaseNotes} />
      </section>
      <section className="card">
        <h2>Credits</h2>
        <p>The Records Project · Sumeitideas</p>
        <p>Minecraft avatars by MCHeads</p>
        <p>Material Symbols by Google · EarthMC map by EarthMC</p>
      </section>
    </div>
  );
}
