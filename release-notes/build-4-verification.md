# Build 4 verification — 24 October 2026

Release: Nostra-2 Phase 2. Numeric update build/tag: 4. Windows MSI: 1.4.2.

- Client: 227 tests passed across 45 files.
- API: 211 tests passed.
- Dart updater: 8 tests passed.
- Native Windows code: 7 tests passed; the optional live EarthMC test was skipped.
- Production frontend and Windows MSI builds passed.
- Signed update metadata, MSI size and SHA-256 verified with the production Dart verifier and release publisher dry run.
- Installer properties inspected: ProductVersion 1.4.2 and the existing upgrade identity retained.
- Installer file table includes the application and freshly compiled Dart updater.
- Administration sections, filtering, sidebar scrolling and page sliders checked in the development browser.

No installed-app upgrade or same-build reinstall was performed for Build 4. The earlier isolated updater cycle is documented in FINAL-TEST-REPORT.md. Public latest-release checks are performed after publication.
