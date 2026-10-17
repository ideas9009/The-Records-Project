# News

Articles are stored in nations/byzantium/news/{id}. Only the server accesses Firestore. A transaction updates the canonical article and its body-free news_feed projection together. Drafts and archived articles have no feed projection.

GET /api/news returns the latest 200 due publications in reverse publication order. GET /api/news/manage returns the latest 200 updated articles for publishers. The app searches loaded titles, subtitles and authors. GET /api/news/{id} restricts drafts, archived and future articles to publishers.

POST /api/news creates an article. PUT /api/news/{id} edits it. POST /api/news/{id}/archive preserves the article while removing its feed entry. Edits and archive operations require the last version number.

Publishing roles: approved operator, admin, leader, minister. Writes recheck the actor inside the Firestore transaction. Ministers cannot review registration requests. Author identity and timestamps are assigned by the server.

Schedules are submitted with an explicit timezone and stored as UTC milliseconds. Firestore filters publishAt <= server time; no worker or always-awake service is required. The app refreshes every 30 seconds and on focus. The query uses Firestore's automatic single-field index on publishAt; no composite index is needed.

Thumbnails are compressed to JPEG in the app (maximum 160,000 data-URL characters). Title limit 160, subtitle 300, body 50,000 characters. Markdown supports GFM tables, strikethrough and task lists; Discord mode additionally supports underline, spoilers and line breaks. Discord mentions, custom emoji and timestamps are not resolved. Raw HTML is ignored and article links/images must use HTTPS.
