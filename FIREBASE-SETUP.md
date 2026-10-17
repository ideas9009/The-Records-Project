# Current Firebase architecture

The active app now uses the Render server for its own username/password login and all rebuilt Firestore workflows. It does not use Firebase Email/Password or anonymous sessions. See [RENDER-SETUP.md](RENDER-SETUP.md) for deployment, service-account setup, first Operator and verification.

Publish the current firestore.rules to deny all direct clients. The server uses a single Admin SDK service identity and enforces authorization itself. Password hashes are stored only in the server-private server_credentials collection. Previous local/anonymous records are preserved without automatic migration.
