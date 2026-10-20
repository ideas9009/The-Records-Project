# Manual EMC registration

Manual registration is distinct from Microsoft ownership verification.

1. POST /api/auth/register/lookup accepts a Minecraft username, rate-limits the request and reads public EMC player/town records. It returns profile facts and an opaque, ten-minute, single-use receipt. It does not create an account or town.
2. The user confirms the profile, then sets and confirms a TRP password. POST /api/auth/register requires the receipt and explicit confirmation, rechecks identity/town facts, hashes the password and atomically creates a pending Citizen account. Browser-provided roles, towns or mayor flags are ignored.
3. The user stays on the registration status screen. Own-profile and Administration recheck controls can refresh pending EMC facts without approving or creating towns.
4. A reviewer must verify ownership outside the public lookup and approve the registration. Both the registration approval route and administrative status-update route enforce the same server rules.
5. Mayor approval rechecks identity and mayor status, then atomically creates or links the town, assigns Mayor membership and writes its first registered resident. Existing ownership is never silently taken over. A second capital is refused.
6. Citizen approval requires an existing non-test town whose current EMC mayor is an approved TRP account. Pending or suspended mayors do not unlock approval. Once accepted, the citizen is written directly into the town's registered resident list. Waiting citizens become eligible for review after their mayor's approval; they are not automatically approved.
7. Government and unfamiliar EMC ranks go to senior Rank Review. A manually approved identity can be reviewed there; Operator cannot be granted from EMC ranks. Manual approval does not set minecraftVerified, which remains reserved for Microsoft/Minecraft authentication.

Accounts submitted with the previous manual form retain their existing workflow. New registrations require the staged confirmation, including direct API requests. Existing manual accounts cannot bypass review by linking Microsoft while pending.

Public-profile absence cannot distinguish a nonexistent player from an API opt-out, so the lookup error explains both possibilities. EMC outages produce a retryable service error instead of a nonexistent-user claim. No email-to-Minecraft inference is used.

Passwords exist only in the request and private salted credential record; confirmation receipts contain only server-fetched public facts and expiry data. Receipt collections are excluded from client caching and expired receipts are cleaned alongside OAuth flows.

Tests cover receipt expiry/replay, concurrency, role forgery, both approval endpoints, town creation delay, waiting citizen enrollment, suspended/revoked accounts, town ownership conflicts, changing EMC facts, HTTP requests and the single-capital rule. Production identities and towns are not created by the tests.
