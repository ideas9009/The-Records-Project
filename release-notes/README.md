# Release note history

`../RELEASE-NOTES.md` is the current Phase 2 development document used by About and the release publisher. It contains Phase 2 changes only.

`archive/` preserves the original Phase 1 snapshots:

- `nostra-2-phase-1-build-2.md`: original published build 2 notes, MSI 1.4.0.
- `nostra-2-phase-1-build-3.md`: the previous RELEASE-NOTES.md, preserved without changes and checked against published build 3 notes, MSI 1.4.1.

The in-app Changelog starts with these saved snapshots and checks the public GitHub releases API for additional published versions. Saved versions remain available if GitHub cannot be reached. Future published versions appear automatically; add their notes to the saved catalog when shipping a later app build if offline access is needed.

Starting a new phase: archive its predecessor, replace the current notes with the new phase's changes, and update `src/lib/app-release.ts`. The display phase is independent of the updater build number. Do not edit a published version's archived notes when preparing the next phase.
