# FoldForge privacy and security contract

Status: **approved target; implementation pending**. The final section lists current legacy behavior and gaps. Nothing in this document should be read as a claim that the pivot is already deployed.

## Data flow

In target live mode:

1. The browser sends the brief and typed constraints to a same-origin FoldForge API route.
2. The server validates access, origin, media type, byte size, schema, quota, token budget, and concurrency before any model call.
3. The server sends only the minimum prompt/typed context required to OpenAI’s Responses API with `store:false`, strict Structured Outputs, bounded output, and a privacy-preserving `safety_identifier`.
4. The server treats the response as untrusted, validates it, and passes accepted data to the deterministic compiler/verifier.
5. Prompt and response content remain request-scoped in server memory. FoldForge has no server database and does not persist model content in application logs.
6. The browser may retain the active project checkpoint locally for at most 24 hours and must provide a visible “Clear project data” action. Secrets and access codes are never stored there.

Offline mode makes no OpenAI request. It must identify disclosed fixtures or deterministic controls and must not present an arbitrary brief as model-interpreted.

## Data sent to OpenAI

The minimum live payload may include the user’s design brief, normalized constraints, bounded grammar/schema, and—during repair—the relevant structured verifier failures. FoldForge must not send browser cookies, access codes, API keys, raw IP addresses, raw user-agent strings, unrelated project history, exported file bytes, or local-storage contents.

Responses use `store:false`. According to the official [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create), that disables storing the response for later retrieval. It does **not** mean zero provider retention. OpenAI’s [API data controls](https://developers.openai.com/api/docs/guides/your-data) state that API data is not used for training by default and that abuse-monitoring logs may be retained for up to 30 days, subject to account controls and legal requirements. Users should not submit confidential, personal, regulated, or proprietary content they are not authorized to send.

## Identity and safety subject

- The server issues a random 192-bit session subject after successful access and binds it into the signed access token.
- The server derives the OpenAI `safety_identifier` from that signed subject with domain-separated SHA-256; it never derives it from email, IP, or user-agent data.
- The safety subject is stable only for the two-hour access session and is not exposed in the UI or production logs.
- Subject rotation, cookie expiry, or “Clear project data” prevents application-level linkage to a later session.

This follows OpenAI’s [safety identifier guidance](https://developers.openai.com/api/docs/guides/safety-best-practices), which recommends a stable privacy-preserving user or session identifier for abuse response.

## Secrets and access

`OPENAI_API_KEY`, `DEMO_ACCESS_CODE`, and `ACCESS_COOKIE_SECRET` are server-only. They must be ignored by Git, excluded from build output and logs, absent from `NEXT_PUBLIC_*` variables, and never written to cookies, local/session storage, URL parameters, analytics, error messages, or health responses.

Target live access uses:

- a demo access code of at least 12 random characters;
- an access-cookie signing secret of at least 32 random bytes;
- a constant-time access-code comparison; and
- a signed `__Host-foldforge_access` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, and a maximum age of **2 hours**.

The access cookie contains only expiry and the random session subject, plus an authentication tag. It contains no prompt, response, API key, or access code.

## Network and request limits

Every mutating API route must accept `application/json` only, reject cross-origin requests with an Origin check or Fetch Metadata policy, stream-count the body instead of trusting `Content-Length`, and fail before parsing once its cap is exceeded.

| Route family                                                                | Maximum request body |
| --------------------------------------------------------------------------- | -------------------: |
| `/api/access`                                                               |                1 KiB |
| `/api/generate`, `/api/compile`                                             |               32 KiB |
| `/api/repair`, `/api/finalize`                                              |               64 KiB |
| `/api/export/svg`, `/api/export/dxf`, `/api/export/glb`, `/api/export/json` |              256 KiB |

Exact live limits per random session subject:

- access: **5 attempts per 10 minutes** per privacy-preserving network bucket;
- compile/generate: **20 requests per hour**;
- repair: **6 requests per hour**;
- finalize/comparison: **20 requests per hour**;
- all live model routes combined: **30 requests per hour**;
- model input: **50,000 tokens per hour**;
- model output: **20,000 tokens per hour**;
- simultaneous live requests: **2 per session** and **8 process-wide**;
- OpenAI SDK retries: **0**; and
- model request timeout: **60 seconds**.

Per-call output ceilings are 3,000 tokens for compile/generate, 2,500 for repair, and 2,000 for final comparison/instructions. A quota, token, or concurrency rejection returns `429` with a bounded retry hint and makes no model call. Multi-instance production must use a shared atomic quota/concurrency store; an in-memory map is not sufficient for a release claim.

`ENABLE_LIVE_OPENAI=false` is the default and production kill switch. Live calls fail closed unless the flag, API key, access code, signing secret, origin policy, quota store, and concurrency controls are all valid.

## Validation and model boundaries

- Strict schemas reject unknown fields and over-limit arrays before compilation.
- Model text is data, not a command. It cannot choose server tools, environment variables, logging policy, URLs, file paths, or export bytes.
- Repair accepts no more than eight allowlisted operations per cycle and five cycles.
- The deterministic verifier alone declares validity.
- Error responses expose stable codes and safe details, never stack traces, prompts, model output, secrets, internal paths, or provider request bodies.
- `/api/health` reports service state, live-enabled boolean, and deployed build SHA; it reports no secret presence/value, prompt, session subject, or provider response.

## Logging and monitoring

Production logs are metadata-only. Allowed fields are timestamp, build SHA, route, HTTP status, safe failure code, duration bucket, input/output token counts, live/offline boolean, aggregate quota counters, and a rotating one-way audit subject derived from the signed session. Disallowed fields include prompt or response content, intent/program/IR bodies, coordinates, exports, cookies, access code, API key, raw session/safety subject, IP address, user agent, authorization headers, and raw provider errors.

Security monitoring may aggregate counts for authentication failures, quota exhaustion, schema rejection, provider failure, and kill-switch state. Raw content must not be introduced for debugging; local reproduction uses synthetic fixtures.

## Browser storage and deletion

The target stores only the active project checkpoint, UI preferences, schema version, and expiry in local browser storage. Checkpoints expire after 24 hours and are purged on load when expired. A clear action removes the checkpoint and preferences immediately. Downloaded exports remain under the user’s control and are not deleted by clearing browser state.

No analytics, advertising tracker, account profile, or cross-device sync is required for the submission build. Adding any of them requires a new data-flow review and updated disclosure before collection begins.

## Current legacy status and gaps

As of 2026-07-14:

- Production live AI is disabled with `ENABLE_LIVE_OPENAI=false`; the hosted site makes no paid model calls.
- Existing model calls already set `store:false`, bound output, disable SDK retries, use a 60-second timeout, and send a safety identifier.
- The current worktree includes foundations for a signed two-hour production `__Host-` cookie with a random session subject, same-origin/Fetch Metadata guarding, route-selectable body parsing, request/token quota and concurrency gates, metadata audit events, kill-switch state, and build-SHA discovery.
- Those foundations are not yet evidence of end-to-end enforcement: every live/export route still needs integration tests against the exact caps and budgets above, and multi-instance production needs a shared atomic quota/concurrency store.
- Safety-identifier derivation from the signed session, target export-route caps, split input/output token accounting, metadata-only log assertions, and build-SHA health output still require release-level route wiring and tests.
- The current deployment is the legacy stand prototype, not the generalized compiler.

These gaps are release blockers for live target mode. They are not papered over by keeping the kill switch off; offline target release still requires honest unavailable-state behavior and the applicable non-live security tests.

## Reporting a concern

Do not include secrets, access codes, personal information, or proprietary prompts in a public issue. Report the affected build SHA, route, safe error code, and reproduction using synthetic data. Revoke and replace an exposed OpenAI key immediately through the OpenAI project security settings.
