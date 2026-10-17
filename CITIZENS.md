# Citizens directory

Authenticated pending and approved accounts can browse the directory and public profiles. Only approved Records accounts belonging to Byzantium appear. Pending, rejected, suspended, foreign-nation and legacy anonymous accounts are excluded. Pending viewers cannot open town details.

The server returns an explicit public projection: account ID, Minecraft username, roles, registration date and registered town affiliations. Credentials, email, Discord details, approval metadata and administrator fields are not returned. Profiles are read-only; account management stays in Administration.

Town affiliations come from existing registered resident lists and mayor ownership. No EarthMC membership, player status or rank is inferred. Missing town associations display as “No registered town”.

SmartSync optionally saves the public directory and viewed profiles; Citizens can be selected for background syncing. The same account isolation, expiry and online account verification rules apply. An offline copy can be outdated, including role or approval changes, and is labelled as saved data. Explicit access denials clear the cached response.
