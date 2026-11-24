# INSPIRE conversation prototype

Historical snapshot of the initial prototype. Current emulator-backed identity,
quota and knowledge behavior is documented in [inspire-service-emulator.md](inspire-service-emulator.md).
The current development experience requires Auth and Firestore emulators.

Implemented locally on 9 November 2026. Route: `/ai-inspire`.

## Run

Use Node 22.15+ or a newer supported Node release. Verification here used Node
25.2.0 and the dependencies already installed in the repository. No dependency
or framework was added.

```powershell
npm install
npm --prefix functions install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/ai-inspire`. The simulation is served by Vite's local
middleware. It works without an AI service, API key, Firestore or Firebase
emulators. Site fonts still use the existing Google Fonts stylesheet.

```powershell
npm test
npm run build
# Leave the local dev server running in another terminal:
npm run test:browser
node tests/inspire-diff.mjs
```

Browser checks use an installed Chrome or Edge, an isolated temporary profile,
port 9333 and synthetic messages. Set `CHROME_PATH` if needed. Screenshots and
the browser result report are generated under `docs/evidence/inspire-chat`.
The PNG export generated during regression testing stays in the temporary
browser profile and is removed when the test finishes. No booking is submitted.

## Implemented boundary

- `src/pages/AIInspire.tsx`: presentation, scoped CSS, ordinary Vietnamese
  conversation starters, role separation, explicit correction references,
  loading/error/retry states and mobile conversation navigation.
- `src/services/inspireConversation.ts`: page-owned in-memory conversation
  store. Synchronous submission locks, separate drafts and pending operations,
  conversation switching and immutable original message wording.
- `src/services/InspireAIconnect.ts`: local HTTP transport, timeouts and response
  validation. There is no Firebase/model fallback.
- `functions/src/inspireChatContract.ts`: one shared allowlisted wire schema.
  Only ordered user/assistant turns, unique IDs and earlier user correction
  references are accepted. Limits: 2,000 UTF-16 code units per message, 31
  messages per request and 24,000 total code units. Oversized history is
  rejected in full. Unsupported authority, identity and provenance fields
  are rejected. Text is always untrusted content.
- `functions/src/inspireChatSimulation.ts`: process-local session/operation
  cache and an explicitly mechanical offline adapter. It quotes input,
  acknowledges corrections and tracks turn count. It never imports test
  fixtures or answers and never calls a model. The server checks history
  against previously accepted turns, including its own assistant responses.
- `vite.config.ts`: bounded JSON request reader and local-only simulation
  endpoint with same-origin checks and no request-body logging.
- `functions/src/inspireAI.ts`: the live callable validates then returns
  `failed-precondition`. No provider client or provider secret is loaded.
  The existing Firestore rolling limits (10/10 minutes and 30/24 hours), IP
  handling and transaction implementation are retained for future integration.

Production builds show a closed-state disclosure and disable sending. The
development middleware is absent from Vite preview and built static output.
No environment variable or client field enables model use.

The built production preview was also opened in Chromium: disabled controls,
the closed-state disclosure and zero chat API requests were verified, including
a programmatic form submission. Evidence: `closed-production.png` and
`production-results.json`. To repeat, run preview on port 5174, set
`INSPIRE_TEST_URL=http://127.0.0.1:5174`, then run
`node tests/inspire-browser.mjs --production`.

## Retry and restart semantics

A session handshake returns a server-generated random session reference and
process epoch. Each user turn gets one operation ID. A network failure or
untrusted response leaves that original user turn pending, outside of which
the UI shows the error. Explicit retry uses `kind: replay` and the same IDs and
history. An existing operation returns the same in-flight or completed result.
Changing the content while reusing an operation ID is rejected.

A replay whose operation is missing never starts generation. After a server
restart, the epoch mismatch rejects both replay and send using the old session.
The user is directed to a new conversation; the unresolved user text remains
visible. A confirmed adapter failure can offer an explicitly labelled new
attempt: new operation ID, same user message and history. No automatic retries
or reconnect-and-resubmit fallback exist.

Responses must match epoch, session, operation, conversation and last user ID,
and contain only a valid assistant message. Validation runs on both sides.

## Memory and limits

The page keeps up to 20 conversations in memory. Refreshing or leaving the page
resets the UI. There is no localStorage, sessionStorage, IndexedDB, cookie or
cloud conversation persistence. Local server sessions expire after 30 minutes
of inactivity, and expired entries are pruned on new session creation. The
simulation caps sessions at 100 and cached operations at 1,000, rejecting
capacity overflow rather than evicting unresolved work. No existing cloud
retention policy or rate-limit collection is changed.

## Verification evidence

- `npm test`: 17 tests passed, covering full two-role context, exact original
  wording, corrections, duplicate and overlapping requests, dropped responses,
  replay vs new attempt, lost/expired operations, unresolved server restart,
  invalid roles/fields/context, forged history and response binding. The actual
  Firebase callable wrapper was invoked in-process and failed closed before
  accessing Firestore or a provider.
- `npm run test:browser`: 10 checks passed in actual Chromium at desktop and
  390px mobile widths. A real HTTP response was deliberately dropped after
  server handling, then recovered by explicit replay. Refresh reset was tested.
  All six counselling routes, share and PDF click handlers, a real downloaded
  1080px PNG, and the retreat booking form were checked. PDF/native share OS
  effects were stubbed; their external dialogs were not exercised.
- Frontend and Functions TypeScript builds passed. Vite production build passed
  with its existing large-bundle advisory.
- New shared contract and simulation files passed the existing Functions ESLint
  configuration using `ESLINT_USE_FLAT_CONFIG=false`. The normal repository lint
  command fails because the root flat configuration imports missing `@eslint/js`.
  The legacy full Functions lint also reports existing formatting/JSDoc issues
  in `index.ts` and retained portions of `inspireAI.ts`. Those unrelated sections
  were not reformatted.
- Screenshots: `welcome-desktop.png`, `conversation-desktop.png`,
  `retry-desktop.png`, `conversation-mobile.png`. Details: `browser-results.json`.

## Remaining integration gaps

No `INSPIRE_WEB_MULTITURN_SCOPE_A` implementation or Controller 0.4.0 contract
was found in the repository, relevant supplied attachments or matching local
downloads. No Controller integration, permission system or provenance attestation
is claimed. The shared schema/output checks are prototype controls, not a
replacement for that contract.

Before connecting a model: establish authorization, inspect and connect the
actual Controller contract and its permission/provenance/output checks, define
trusted instruction handling, and provide a multi-instance operation mechanism
that preserves these replay/restart guarantees while retaining the existing
shared Firestore rate limits. The local cache is not a production/serverless
idempotency design.

Firebase emulators, Firestore availability/concurrency and deployed proxy/IP
behavior were not exercised. No emulator tooling/configuration was available in
this checkout. Existing backend rate-limit logic was preserved, not re-certified.

The working simulation does not establish generative conversation quality,
clinical validity or deployment permission. No paid API was called, no real
client content was used, and nothing was deployed, committed or pushed.
