import ReactMarkdown from "react-markdown";
import releaseNotes from "../../RELEASE-NOTES.md?raw";
export default function About() {
  return (
    <div className="about-page">
      <header className="page-header">
        <div>
          <h1>About</h1>
          <p>The Records Project</p>
        </div>
      </header>
      <section className="card about-management" aria-label="Project management">
        <div className="about-management-brand">
          <svg viewBox="296 381 1408 1239" aria-hidden="true" width="48" height="48"><image href="/trp-logo.png" width="2000" height="2000" /></svg>
          <h2>The Records Project</h2>
        </div>
        <div className="about-management-credit">
          <span>managed by</span>
          <img src="/branding/byzantine-republic.svg" alt="The Byzantine Republic" width="360" height="73" />
        </div>
      </section>
      <section className="card about-version" aria-label="App version">
        <h2>Nostra &middot; 2 | Phase 1</h2>
      </section>
      <section className="card">
        <h2>Updates</h2>
        <p>
          Phase 1 is in development. Update delivery will be added before
          release.
        </p>
      </section>
      <section className="card release-notes">
        <h2>Release notes</h2>
        <ReactMarkdown>{releaseNotes}</ReactMarkdown>
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
