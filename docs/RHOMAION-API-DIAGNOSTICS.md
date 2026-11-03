# Rhomaion API investigation — 29 October 2026

The following checks ran on the actual Render service. Only status codes and timings were collected; no API keys, generated text, account records or chat history were included in the diagnostic results.

| Check | Result |
| --- | --- |
| Google gateway, Node fetch | Responded in 0.5–0.9 seconds |
| Google gateway, direct IPv4 HTTPS | Responded in 0.5–1.1 seconds |
| Authenticated Gemini 3.8 model lookup | HTTP 200 in 0.594 seconds |
| Minimal Gemini 3.8 generateContent | Timed out at 20 seconds |
| Minimal Gemini 3.8 Interactions API | Timed out at 20 seconds |
| Minimal Gemini 3.8 direct IPv4 HTTPS | Timed out at 20 seconds |
| Minimal Gemini 3.7 generateContent | Timed out at 20 seconds |
| Unauthenticated generateContent POST | HTTP 403 in 0.394 seconds |
| Authenticated invalid-body POST | HTTP 400 in 0.409 seconds |
| Minimal OpenAI-compatible Google API | Timed out at 10 seconds |

AI Studio replied quickly in the user's separate test. That is not a direct comparison of the same public API request and serving path.

## What this establishes

Basic connectivity, POST routing and model lookup work from Render. The stalls occur during generation. These observations do not establish whether the cause is project-specific API serving or a Render-specific generation route. The root cause is not resolved.

## Next comparison

Run `Test-Gemini-API.bat` locally with the SAME key configured in Render. It prompts for hidden input, keeps the key in process memory without saving it, and prints only HTTP status and elapsed time. The key must not be pasted into chat.

If the same public API request is fast locally but stalls on Render, investigate hosting/source-region routing. If it also stalls locally, investigate the Google API project, usage and provider serving rather than TRP UI/tools. Neither outcome automatically establishes a billing or quota problem.

The temporary automatic inference probes have been removed. The app remains configured for Gemini 3.8 Flash. No production fallback model was selected.
