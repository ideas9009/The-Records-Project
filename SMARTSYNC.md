# SmartSync Beta

Off by default. Settings remain device-local. The IndexedDB database records-smartsync-v1 holds read-only API response snapshots, scoped by server origin, authenticated UID, role and approval status. Identity must first be checked online by /api/auth/me; no passwords, tokens or profile responses are cached.

Cache-eligible GET routes: town summaries, approved town details/photos, the published News feed and published article details. News management, draft/scheduled article responses, authentication and administration are excluded. Changing data still calls the server; no offline writes are queued. Successful news/town mutations invalidate related snapshots, and explicit permission denials never fall back to saved data.

Resource watchers deliver an eligible snapshot immediately, then fetch fresh data. A saved-data indicator includes its timestamp and sync status. Network failures retain the saved copy for read-only use. Initial sign-in/launch must verify the session online. During an already verified session, offline viewing can continue for up to 15 minutes without renewed account verification.

Settings allow selected feed prefetching for Town Registry and News at 1, 5, 15 or 30 minute intervals (default 5). Only pages supported by active server data are listed. The manager pauses while hidden and resumes on visibility or connectivity recovery. Current views retain their existing 30-second refresh interval. Sync now forces fresh requests for selected pages and reports failures.

Copies expire after 24 hours, and oldest responses are evicted to keep at most 50 MB and 100 entries. Cache reads/writes are generation-guarded so pending responses cannot refill it after clearing, opt-out or account changes. Disabling clears all saved data. Logout and changed permission/account scopes clear the previous scope and immediately revoke access to its snapshots. Storage failures preserve normal online operation and surface feedback. External Markdown images and the embedded EarthMC map are not saved offline.
