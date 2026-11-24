# Private Luna API preparation — 14 November 2026

Current handoff: [run instructions and boundaries](docs/inspire-luna-api.md),
[executed checks](docs/evidence/luna-api-2026-11-14/executed-checks.json), and
[exact proposed single request](docs/evidence/luna-api-2026-11-14/proposed-single-request.json).
This supersedes the older statement below that there is no API sender.

The local private interface prepares an API request and waits for explicit owner
authorization. No API key was configured/read, no actual source permission was
granted, and no paid request was made. Public generation and the rejected US$2
trial remain closed. Controller actual-execution/user-delivery permissions remain
held; this interface is only a synthetic private evaluation workspace.

Retrieval now preserves exact section references, uses conversation/correction
context, filters eligibility before candidate limits, invalidates changed indexes
and rechecks export permissions before dispatch. Evidence uses synthetic permitted
fixtures. Browser visual verification is NOT VERIFIED because the browser access
host is unavailable. Earlier milestones and their evidence are preserved below.

# Private Vietnamese testing — 11 November 2026

Current arrangement: the owner supervises engineering/production; his father
evaluates content and service quality in Vietnamese. The $2 research proposal
was rejected. Its release and dispatch paths now fail closed. The former two-
reviewer and per-turn proposal remains historical, not a canonical INSPIRE rule
or a requirement of the father's testing screen. Source permissions and the
unmodified Controller/catalogue controls are preserved.

Start existing local Auth/Firestore emulators, then:

```powershell
$env:INSPIRE_PRIVATE_TEST = '1'
npm.cmd run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/ai-inspire?thu-rieng=1`. This is local-only, explicitly
**simulation**, with free Vietnamese questions, follow-ups, corrections and
session-only notes. Account setup is under “Dành cho con”. Refresh clears chat
and notes. No new answer catalogue was added. Content quality requires later
model-backed testing; the disabled Luna button makes that distinction visible.

`functions/src/inspireLuna.ts` prepares a source-free input for the existing
ChatGPT/Codex connection and checks candidate binding offline. It has no model
sender, API-key fallback, credential import or delivery permission. It omits all
retrieved private text, inherited operating text and free-form profile data.
Actual Controller validation/delivery of generated Luna outputs is still closed
and unverified. The existing simulation still uses the original Controller.

`node tests/inspect-inspire-luna.mjs` uses only initialize, account/read,
model/list and account/rateLimits/read: no thread or turn. The installed Codex
0.164.0-alpha.11.1 reports ChatGPT sign-in, plan `team`, and available
`gpt-6-luna` (also older `gpt-5.6-luna`). The Work cache calls current Luna
`gpt-6-luna-wm`; this is not an API credential. Workspace usage is distinct from
pay-per-token API billing. Automatic credit spending/overage is not verified
disabled, so generation remains unavailable. No additional spend is authorized.

Evidence, screenshots and the focused milestone diff are in
`docs/evidence/luna-private-2026-11-11/`. No private source excerpt, account ID,
email or credential belongs in that evidence. Before a model session, the
concrete outstanding choice is whether to use the existing workspace's Luna
allowance with additional charges blocked. No corpus approval is needed for the
current source-free preparation; any later document use needs a narrow, plain
Vietnamese explanation of the particular text and destination.

# Local research safeguards — 10 November 2026

Start with [the implemented research runner](docs/inspire-research-implementation.md).
It records the isolated CLI, durable call/cost limits, protected quarantine,
offline verification and exact pending source-disclosure commands. All nine
actual-source grants remain unapproved. No paid model or public AI was activated.
New evidence is in `docs/evidence/research-implementation/`; older handoff evidence
and the existing website are preserved below.

# Current review ZIP and generative-trial preparation

Start with [docs/model-trial-preparation.md](docs/model-trial-preparation.md).
It explains the unchanged Controller boundary, the disabled candidate adapter,
source-use decisions and one **unapproved** 12-call / US$2 model-trial proposal.
Current evidence is in `docs/evidence/generative-preparation/`; the preceding
completed milestone and its focused diff are retained below and in Scope A
evidence. No model, approval or production access is activated.

# Scope A / Controller 0.4.0 review

The current milestone is documented in [docs/scope-a040.md](docs/scope-a040.md).
Read its private-package/Python prerequisites before starting the site. The
actual 0.4.0 mock Controller is now connected and tested offline; actual
execution and model access remain closed. New evidence is separate in
`docs/evidence/scope-a040/`. The earlier consolidation report below is retained
as historical evidence; its missing-package/Controller statements are superseded.

# INSPIRE review package — 9 November 2026

This package consolidates the existing implementation for review. It does not
enable a production account service, model, Controller, booking or deployment.

## Start here

Use Node 24 LTS and Java 21+. No secrets or production Firebase login are needed.

```powershell
npm ci
npm --prefix functions ci
# Terminal 1: isolated Firebase Auth/Firestore emulators, demo-inspire only
npm run emulators
# Terminal 2: development site
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/ai-inspire`; emulator UI: `http://127.0.0.1:4000`.
Only invented accounts and messages may be used. Auth identity persists through
Firebase's local Auth storage; chat transcripts remain in memory and reset on
refresh/leaving/account switching. Optional profiles and quota records are local
emulator data. Neither a database export nor real user data is in this ZIP.

The raw private corpus is intentionally excluded. `npm run knowledge:import`
can reuse the original local files when they exist at their documented locations;
it must not be interpreted as a permission or approval step. The offline trace
test creates and removes its own synthetic permitted fixture and does not need
those private files. See the source audit before considering actual-source use.

## What changed during consolidation

- Fixed style and JSDoc in all six new/modified backend source files and made
  Functions lint use its own ESLint 8 configuration. No rule was disabled for
  TypeScript; the CommonJS helper has a file-specific CommonJS import setting.
- Preserved the unrelated booking implementation. Its 30 existing lint errors
  match Git HEAD exactly by rule, line, column and message. The root frontend
  flat config's missing-import failure is also unchanged; it is not used as a
  substitute for backend lint.
- Removed emulator service initialization from Vite build/preview configuration.
  The middleware initializes only in the development-server hook, in development
  mode. Server initialization additionally rejects `NODE_ENV=production`, and
  client simulation Auth rejects non-development operation before initialization.
- Added only targeted verification and review tooling; no product feature or
  source approval was added. Existing auth/quota/chat/booking/retreat behavior
  remains in place. The complete diff includes the previous uncommitted work.

## Source integrity is not permission

`docs/evidence/inspire-review/source-integrity-and-permissions.json` records
original-file, private-copy and receipt SHA-256 equality, byte sizes and scope.
The five known available originals/raw receipts were byte-verified:

| Material | Integrity/receipt classification | Established runtime approval |
| --- | --- | --- |
| Existing website counselling Markdown | Public website supporting content, already configured for supporting retrieval | Separate permission evidence not found; not certified as operating authority |
| `01_CONTENT_PATCH_FULL.md` | WORKING CONTENT PATCH / REVIEW REQUIRED | None established; excluded from retrieval |
| `Devamicus_INSPIRE.pdf` | Unverified original receipt; no content reconstructed | None established; receipt-only |
| PEC stage 1.5 Python artifact | Explicit test-only artifact, missing `mock_engine.pec_mock` | None; receipt-only, not a Controller |
| `INSPIRE-main.zip` | Website source archive, not the 24-document knowledge bundle | None established; receipt-only |

No actual-source runtime permission is newly granted or certified by this work.
The previously configured website supporting-use flag is reported separately
from permission evidence. Existing metadata/approval flags were not changed.
The patch is not an amendment or source approval. The 458 lessons remain drafts;
historical MOI-01-A verification remains pending; no reconstructed MOI-01-A was
created, imported or promoted. DT01–DT14/D1–D8 and the ten unresolved family names
were not promoted into customer classifications or intervention permissions.

Checked the repository, known original Downloads files, attachment filenames,
private receipts, the available website ZIP directory and accessible Pages
titles. The 24 original documents, authoritative Knowledge Core and actual
Controller 0.4.0 contract/package were not byte-accessible in those locations.
That is a missing dependency, not proof that they do not exist elsewhere. No
request to resend documents individually was made.

## Executed evidence and limits

Run `node tests/inspire-review-verify.mjs` with emulators, the dev site on 5173,
and `npm run preview -- --host 127.0.0.1 --port 5174` running. It saves the real
command outputs and exit codes under `docs/evidence/inspire-review`.

| Check | Classification and evidence |
| --- | --- |
| Touched backend lint | Executed; zero errors. `backend-lint-touched.txt` |
| Full backend lint | Executed; 30 unchanged `functions/src/index.ts` errors only. `lint-baseline-comparison.json`, full JSON/output |
| Root flat config | Executed; unchanged pre-existing missing dependency/import failure. `root-lint-*.json/txt` |
| Conversation contracts | Executed existing suite: 17 tests. Ordered roles, corrections, replay/new attempt, duplicate protection, response binding, restart and validation |
| Auth/Firestore | Executed existing suite: 10 tests. Anonymous/email and synthetic Google credentials, quota exhaustion/calendar logic, linking/isolation, rules denial and source controls |
| Targeted gaps | Executed 5 tests: exact adapter-input trace; 28/30 concurrent exhaustion; deferred reply crossing Vietnam midnight; synthetic receipt reconciliation after restart; production config rejection |
| Actual browser | Executed development regression and production closure checks. Genuine desktop/mobile screenshots and JSON results included |
| Builds | Executed Functions and production TypeScript/Vite build. Existing bundle-size advisory retained |
| Build privacy | Executed scan of all production files for synthetic private canaries, restricted source IDs and emulator-only Auth markers; production browser checks absence of account controls and emulator/chat traffic |

`adapter-input-trace.json` contains the exact constructed input received by an
injected offline `ModelAdapter.reply(context)`, including the retrieved passage,
document ID, version, SHA-256, section ID and status. It also shows ordered user
messages, separate user-stated preferences and separate operating instructions.
The passage is explicitly synthetic and permitted only for this offline test;
the trace is not an approval of any actual INSPIRE source or proof of model use.
The actual simulation adapter does not import test answers as runtime responses.

Midnight and near-exhaustion checks hold actual adapter calls in flight, not
just a quota arithmetic helper. Unknown outcomes retain reservations through
restart. Reconciliation is exercised with an independent synthetic receipt via
the internal ledger method and charged once; no new reconciliation endpoint or
production reconciliation authority is claimed.

Browser regressions preserve six counselling routes, share/PDF handlers, a real
1080px PNG download and retreat/booking-form rendering. OS PDF/share effects are
stubbed, and no booking/email/external share is submitted. The browser test resets
only its loopback emulator rate fixture before the run; rate enforcement remains
enabled during the run and has a separate real Firestore transaction test.

## Unresolved / unverified / blocked

- **Blocked actual-source approval:** original 24-document bundle/permission
  evidence and authoritative Core are missing in the checked scope. Receipt,
  checksums, configured tags and publication do not grant runtime permission.
- **Unverified:** Controller 0.4.0 integration, real Google OAuth, model quality,
  generative knowledge use and clinical validity. Synthetic emulator credentials
  are a substitute for OAuth testing, not an actual Google authorization test.
- **Blocked production activation:** no deployment/model authorization; account
  endpoints are local middleware only. Production access/retention/deletion and
  trusted reconciliation policy, provider setup/authorized domains, shared result
  and session handling for multiple instances remain future work.
- **Pre-existing failures:** 30 unchanged booking-file lint errors and the root
  flat-config dependency/import failure. No new backend lint failures remain.
- **Limits:** finite canary scans are not a proof against every transformed
  secret. No production proxy/IP or production Firestore availability was tested.
  No retention policy was approved; indexing is not model training or permanent
  memory. Dependency audit warnings from the earlier CLI installation remain a
  separate review item; no unrelated dependency upgrade was made here.

## Package boundaries

Includes current source/configuration, lockfiles, tests, public website assets,
complete working-tree diff, these instructions, real verification outputs and
genuine screenshots. The manifest lists payload sizes and SHA-256 digests.

Excludes `node_modules`, `.git`, `.env*`, credentials, portable runtimes,
private originals/raw copies, emulator/browser profiles, runtime databases,
database exports, generated Functions output, build caches and real user data.
Synthetic test credential strings/fixture traces are marked test-only; no live
credential values or tokens are included. Firebase web configuration already in
the public application is not an AI-provider secret or service-account credential.

No deploy, paid API call, real client input, booking, production migration,
source-approval change, commit or push was performed.

To regenerate the review artifacts after verification:

```powershell
node tests/inspire-diff.mjs
node tests/inspire-review-package.mjs
node tests/package-inspire-review.mjs
```

The ZIP writer refuses to overwrite an existing ZIP. Creation uses the ZIP
library already present with Firebase CLI; an independent read-only .NET reader
checks every entry's SHA-256. No Windows execution policy is changed.
