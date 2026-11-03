import FeedbackButton from "../components/FeedbackForm";
import { AboutUpdater } from "../components/DesktopUpdater";
import ReleaseNotes from "../components/ReleaseNotes";
import { APP_RELEASE_LABEL } from "../lib/app-release";
import "./Changelog.css";
import releaseNotes from "../../RELEASE-NOTES.md?raw";
export default function About({ go }: { go?: (page: string) => void } = {}) {
  return (
    <div className="about-page">
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
        <FeedbackButton/>
      </section>
      <section className="card about-version" aria-label="App version">
        <h2>{APP_RELEASE_LABEL}</h2>
        {go && (
          <button data-tour="changelog" onClick={() => go("changelog")}>
            <span className="material-symbol" aria-hidden="true">
              history
            </span>
            Changelog
          </button>
        )}
      </section>
      <AboutUpdater />
      <section className="card release-notes">
        <h2>Release notes</h2>
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
