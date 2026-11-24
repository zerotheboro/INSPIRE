# INSPIRE authenticated conversation prototype — emulator handoff

Consolidated review, current lint/source-permission findings and the latest
executed evidence: [REVIEW.md](../REVIEW.md). This document also records the
initial implementation context; the review distinguishes receipts from approval.

Implemented 9 November 2026, preserving the earlier multi-turn prototype and
unrelated routes, articles, exports, retreat and booking implementation.

## Run locally

Use Node 24 LTS and Java 21+. This execution used installed Node 25.2.0,
Firebase CLI 15.35.0, Auth emulator and Firestore emulator 1.22.0 with a portable
Microsoft OpenJDK 21 under ignored `.tools.local/`. Firebase CLI is the only new
development dependency; no application framework or model dependency was added.
The CLI installation reported transitive dependency audit warnings; no unrelated
dependency updates or automatic audit fixes were attempted.

```powershell
npm install
npm --prefix functions install
# Terminal 1 — ONLY demo-inspire, with isolated CLI preferences:
npm run emulators
# Terminal 2:
npm run knowledge:import
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/ai-inspire`; emulator UI is `http://127.0.0.1:4000`.
The launcher uses a local portable JDK if present, otherwise an installed JDK.
It never logs in to Firebase or selects the real project in `.firebaserc`.

Required local endpoints: Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`,
demo project `demo-inspire`. The backend refuses other emulator endpoints.
The separate chat Firebase app uses only this demo project. Existing site
Firebase configuration and booking functions are unchanged. No secrets are
needed. Account endpoints are local Vite middleware, reusing backend modules
in `functions/src`; they are not exposed by the production callable.

Google's button uses Firebase's local OAuth popup. Use only invented emulator
accounts. Email/password registration links an existing anonymous UID when
possible; signing in to an existing account links the old guest using proof
of both Firebase identities. Sign-out does not automatically mint a new guest.
The app remembers only that a registered account was known on this browser
to keep that signed-out flow closed. This marker is UX bookkeeping, not a
quota/security authority. Browser-data resets or other devices can produce a
new anonymous identity; no fingerprinting or person-level identity claim is made.

## Stage 1: verified identity and quota ledger

`inspireAccount.ts` verifies the Firebase token, checks revocation and fetches
the current Auth user. Provider records determine registration; payload flags,
UIDs, counters, limits, roles and eligibility fields are never accepted.

- Guest: ten completed responses for that anonymous identity, lifetime bucket
  `guest`; there is no time-based replenishment.
- Registered: thirty completed responses per Vietnam calendar month. The server
  computes month keys and the next 00:00 reset using fixed UTC+07:00, independent
  of the browser clock or a batch reset job. Registration during a month receives
  thirty, without adding any unused guest balance or prior-month unused replies.
- Reservation atomically checks completed usage plus pending capacity and creates
  one operation ledger entry. Completion atomically charges once by operation ID.
  Cache replay does not reserve or charge again. A duplicate operation outside
  the cache fails closed rather than starting generation.
- A registered reply completing across midnight is charged to the server's
  completion month. Unresolved registered reservations carry across boundaries
  and reduce available capacity until resolved; they are not silently refunded.
  Guest reservations remain guest operations if the account upgrades while they
  are running; the guest balance is never transferred into a monthly bucket.
- Only the explicit `ConfirmedNoReply` adapter outcome releases a reservation.
  Generic failures, unknown outcomes or ambiguous completion commits remain
  pending/unknown. They require trusted reconciliation evidence; there is no
  client settlement endpoint, timeout refund or automatic regeneration.
- A fresh server epoch rejects old sessions. Persistent operation hashes/statuses
  prevent a lost cache from silently executing a known operation again. Full
  responses are not persisted; losing an in-memory result can make it unavailable.
- Existing IP request-rate transactions remain 10/10 minutes and 30/24 hours.
  They are separate from completed-reply quotas and execute before reservation
  and the adapter. Rejected preflight attempts do not call the adapter.

## Stage 2: account/profile storage and private knowledge

Server-only collections, protected by emulator deny-all client rules:

| Collection | Stored data |
| --- | --- |
| `inspireAccounts/{uid}` | Verified UID, providers, email if any, Auth creation metadata |
| account subcollections `usage`, `quotaState` | Period totals and outstanding registered capacity |
| `inspireOperations` | Hashed request fingerprint, owner, epoch, status, reservation/charged period, timestamps; no transcript |
| `inspireIdentityLinks` | Verified former guest → registered UID relationship; no balance transfer |
| `inspirePreferences/{uid}` | Only the six optional user-stated fields |
| `inspireKnowledge` and immutable `versions` | INSPIRE source receipt metadata and derived permitted sections |
| `edulienceKnowledge` | Separate namespace, never queried by INSPIRE retrieval |
| `inspireAIRateLimits` | Existing bounded IP-hash timestamp ledger |

Profiles allow blank values for preferred name, cách xưng hô, language, broad age
range, stated context and desired support. They can be edited or cleared. Unknown
fields, inferred diagnoses and classifications are rejected, not stored as facts.
Preferences enter the adapter as untrusted user-stated data, never permissions.
Only the verified owner can reach their profile via the backend. Direct client
reads/writes to these collections, including one's own counters, are denied.

Conversation messages/drafts/switching remain in page/server process memory.
Refresh or leaving resets the chat UI; Auth identity persists via Firebase's
normal browser Auth storage so a refresh does not reset quota. No conversation
transcripts are added to Firestore, browser storage or request logs. This task's
metadata, counters and optional preferences are emulator data only. Production
retention, privileged access, deletion and reconciliation policies remain
unapproved. Emulator state is ephemeral unless an operator explicitly exports it;
this run did not export user/account data for production migration.

The importer preserves raw bytes once by SHA-256 under ignored
`.private.local/knowledge/raw`. Current source receipts are version 1; a second
import left every version unchanged. `importSource` updates only the changed
document and keeps immutable prior versions. Sections are reproducible from raw
text, capped at 1,400 characters; small-corpus document text is capped at 400 KB
to stay safely below Firestore's per-document limit. This first corpus uses
accent-normalized lexical retrieval of at most three relevant sections; no vector
database was introduced. Retrieval checks document/version/hash consistency.

The existing published counselling source is supporting material, not operating
authority. `01_CONTENT_PATCH_FULL.md` was received verbatim as **WORKING CONTENT
PATCH / REVIEW REQUIRED** and cannot enter runtime retrieval. Available PDF,
website source bundle and PEC Python artifact were preserved as unverified raw
receipts, not reconstructed or promoted. Private raw contents are ignored by Git,
never served by an API and absent from built public assets.

`ModelAdapter` receives separate operating instructions, ordered messages,
user-stated preferences and supporting sections with document ID, version, hash,
section ID and source status. The connected offline adapter is mechanical and
does not import test answers or illustrative responses. Retrieval/context passing
was exercised with an injected offline adapter; no generative use is claimed.
Indexing does not train a model or grant permanent memory.

## Stage 3: verified integration and evidence

```powershell
npm test
npm run test:emulators
npm run test:browser
npm run build
node tests/inspire-diff.mjs
```

Executed checks:

- Earlier conversation suite: 17 passing checks for full role history,
  corrections, explicit replay/new attempts, duplicate prevention, session
  isolation, unresolved restarts, invalid roles/authority/oversized context and
  response binding. The production callable wrapper still fails closed.
- Auth/Firestore suite: verified anonymous and email credentials; same-UID
  registration; synthetic Google credential flow; 10/30 exhaustion; calendar
  boundaries and mid-month allowance; concurrent reservations; midnight
  completion; known/unknown and commit failure; restart; guest linking; account
  switching; real rules denial of cross-user records/counters/private sources;
  editable blank profile fields; incremental versions and provenance; restricted
  and Edulience exclusion; adapter context; persistent IP request-rate enforcement.
  Quota-specific tests inject an always-allow rate checker to isolate quota
  behavior; the separate rate test executes the real Firestore limiter.
- Actual Chromium: guest chat, dropped HTTP response and same-operation replay,
  persisted quota after refresh, email registration/link/sign-in/sign-out/reload,
  profile edits, desktop/390px mobile, and no replacement guest allowance on
  sign-out. All six counselling routes, share/PDF handlers, a valid downloaded
  1080px PNG, retreat page and booking form render passed. OS PDF/share effects
  were stubbed; no booking, real email or external share was submitted. The
  browser fixture resets only loopback emulator rate records before each run,
  then leaves real rate enforcement enabled for the run.
- Frontend and Functions TypeScript builds passed; Vite retains the existing
  large-bundle advisory. Consolidation fixed all lint in touched backend files.
  Full backend lint retains only 30 unchanged booking-file errors, matched to
  Git HEAD. The unrelated root flat configuration still has its pre-existing
  missing dependency/import failure. See the review's baseline comparison.

Browser evidence is under `docs/evidence/inspire-chat/`, including guest/chat,
retry and desktop/mobile account/profile screenshots plus `browser-results.json`.
The generated complete review patch includes the pre-existing uncommitted
prototype plus this stage, without staging or committing. Test logs may show
intentional `PERMISSION_DENIED` entries from negative security checks.

## Remaining dependencies and authorization boundaries

The actual Controller 0.4.0 integration contract/package and authoritative
INSPIRE AI 0.3.3 Knowledge Core were not available in this checkout or matching
accessible sources. The available PEC stage 1.5 file explicitly says test-only
and imports missing `mock_engine.pec_mock`; it is not a connected Controller.
No permission, provenance attestation or Controller integration is invented.

WHAT → WHERE → WHY → TOWARD WHAT → HOW remains the operating order. M1–M6
belong inside WHERE. DT01–DT14/D1–D8 remain proposed content; ten problem-family
names remain unresolved; the 458 lessons remain drafts; historical MOI-01-A
verification remains pending. No P1/P2/P3, diagnosis or intervention permission
is inferred from profile characteristics or document tags.

Live model execution is hard-closed in the callable and local service.
Production account endpoints/OAuth configuration, approved Controller and model
adapter integration, approved runtime sources and production access/retention
policies remain separate future dependencies. Before a multi-instance deployment,
also define trusted outcome reconciliation and a shared result/session strategy
consistent with the no-transcript-persistence requirement. No source receipt or
successful simulation test grants deployment permission or clinical validation.

No paid APIs, real client data, booking submissions, real emails, deployment,
production migration, commits or pushes were performed.

Firebase references used: [Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth),
[account linking](https://firebase.google.com/docs/auth/web/account-linking),
[Firestore Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).
