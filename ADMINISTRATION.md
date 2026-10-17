# Administration and roles

Accounts support multiple roles. Permissions combine, and approval status is checked separately. Legacy single-role accounts remain supported; `member` is displayed as Citizen.

Operator has all permissions. Leader and Prime Minister have the same management permissions, excluding development tools. Only Operators may grant or remove Operator access. People cannot remove their own management access or suspend themselves.

Admin can review registrations, moderate Citizens, publish news and register towns. Ministers and Deputies may publish news; only Ministers may register towns. Government account moderation and role assignments require Operator, Leader or Prime Minister.

Mayor ownership is tied to each town's mayorUid. Register Town accepts a name and a registered user, adds Mayor to that user's roles and preserves their existing roles. Registering a town does not approve a pending user. Names are reserved case-insensitively in a transaction. EarthMC counts start at zero until data integration.

Administration has Registrations, People & Permissions and Activity Log. User changes and new town registrations are audited transactionally. The log currently shows the latest 200 actions. Account credentials are never returned by user directory endpoints. Mayor options contain only account ID, username and status, and are excluded from SmartSync.

Citizen editing delegation, additional Minister/Deputy nation management actions, rejection resubmission and dedicated development tools remain to be defined. These permissions are not implicitly granted.
