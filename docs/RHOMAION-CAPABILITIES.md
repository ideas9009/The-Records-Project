# Rhōmaíōn AI capabilities

Rhōmaíōn currently uses OpenRouter with the old Flutter model setting, `deepseek/deepseek-chat`. It uses the new TRP-specific instructions and tools, not the Flutter prompt.

## Main-window actions

- Open registered town pages or live town/player profiles in View towns on EarthMC / View people on EarthMC.
- Search published news, tasks, material requests, shops and bulk listings, then open their detail pages.
- Prepare news, task, material-request, shop and bulk-listing editors with suggested fields.
- Read the app guide and explain the actual pages, buttons and workflows.
- Open a town mayor's Suggestions page, compare expansion directions and highlight a verified connected route with a gold estimate.

## Review and permissions

Draft preparation fills an **unsaved form**. It does not create a record, publish a listing, reserve money or send a message. The human reviews the fields and saves/publishes using the existing editor. Existing unsaved-change prompts protect a form before navigation replaces it. Only one draft can be prepared per AI turn.

News preparation requires publishing permission. Other drafts require an approved account. AI access still follows the signed-in user; Operator AI is capped at Admin. Town edits retain the existing server approval cards and stale-version checks. Suggestions remains mayor-only, including for an Operator using AI.

Routes use verified free chunks and current claim limits. The map revalidates the suggested points against its fetched survey, discarding blocked, unknown, disconnected or excess points. Route previews never claim chunks or spend gold. Suggestions remains beta and may be inaccurate; verify in Minecraft.

Private hiring conversations, passwords, authentication codes and provider keys are not exposed by the new tools. Provider credentials remain on the server. Chat history remains local per account.

## Examples

- “Open Theodoulopolis in View towns on EarthMC.”
- “Show this player’s EarthMC profile.”
- “Prepare a request for 64 Spruce Logs, offering 16 gold.”
- “Draft news about the event using these details…”
- “Prepare a shop listing with these items and town.”
- “Open my town’s Suggestions and highlight an eastward route.”

Native navigation payload changes require a rebuilt/restarted Tauri development app. There is no MSI/version bump in this change.
