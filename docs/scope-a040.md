# Scope A: website and original 0.4.0 mock Controller

This milestone fixes the two independent-review defects and connects the existing
website to the supplied Controller's **offline mock path only**. It does not
establish generative conversation quality, clinical validation, source approval,
actual execution permission or deployment permission. Use invented accounts and
messages only. No paid/local model, booking or deployment was executed.

The attached review and `CODEX_NEXT_TASK.md` were read as engineering input to
the user's request, not as approvals. The review ZIP, its original evidence and
the preview ZIP were not modified. No package frontend, launcher, SQLite store,
budget-approval utility or authorization-writing tool is used.

## Focused changes

- `functions/src/inspireHttp.ts` and `vite.config.ts`: cap original incoming
  bytes at 128000, concatenate once, strictly decode UTF-8 once, then parse JSON.
  Malformed encoding returns `INVALID_UTF8`; oversize returns HTTP 413. Text is
  never normalized. The regression invokes the actual middleware with one-byte
  chunks, Vietnamese, emoji, decomposed characters, both roles and a correction.
- `tests/start-inspire-emulators.mjs`: pure child-environment construction uses
  the platform PATH delimiter and `java.exe`/`java` discovery. Parent environment,
  demo project and loopback restrictions are preserved. Windows Java 21 executes;
  POSIX construction/discovery are tested with fixtures, not on Linux/macOS.
- `functions/src/inspireController040.ts` and `functions/controller040_bridge.py`:
  small private JSON-lines bridge to the **unmodified** preview modules. Node pins
  the received manifest; Python verifies every listed payload before import.
  UTF-8 mode also prevents the preview's implicit file reads using Windows legacy
  encoding. A stripped child environment supplies no provider credentials;
  outbound socket connections are disabled before importing package modules.
  Each service owns its worker and closes it with the development HTTP server.
- The existing local service supplies the complete structured `ModelContext`
  and validated request. It uses the bridge by default; missing dependencies or
  failed controls hold the request rather than falling back to an unchecked echo.
  Model adapters remain rejected. No frontend architecture or UI was replaced.
- Account quotas, persistent IP limits, strict request validation, ordered history,
  correction references, stable retry/replay IDs, technical errors outside the
  timeline and production closure are retained. No new transcript persistence.
- Tests/evidence include targeted regressions, actual native control denials,
  process loss, browser navigation timing and a finite public-build privacy scan.

## Source receipt and permission are separate

`docs/evidence/scope-a040/package-audit.json` records the received archive hash,
all source hashes/statuses and the verification result: **1234/1234 manifest
payloads and 55/55 indexed source records match**, including INSPIRE-01–24.
Verification was rerun after exercising the bridge. Originals and versions remain
private and unchanged; no canonical text was recreated.

| Category | Current result |
| --- | --- |
| Original/indexed sources present | All 55 indexed records byte-verified; 24 main IDs present. This is receipt/integrity, not equal authority. |
| Actual-source user-facing runtime approval | Not established. No actual record was newly imported into the website's permitted retrieval collection. |
| Synthetic permitted retrieval | Test-only invented Firestore fixture with explicit supporting-use metadata; removed after the integration test. This grants no actual-source permission. |
| Original preview working source | Exact MOI-01 v1.0 parent, hash `931985119075683652b770b93f1f08c889b1acc3e74fa5dd6dcbd5caf22f8ef3`, sections XCII, XCIII, CLVI, CLVII, CLIX, CLXIII, retained as Proposal/Pending Review, not permission or approved Core. Used only inside the original synthetic research path. |
| Restricted material | 54 records retain `UNCHANGED_NOT_GRANTED_BY_INTAKE`; one retains `PROPOSAL_PENDING_REVIEW`. Historical MOI-01-A remains `SOURCE_VERIFICATION_PENDING`. The 43 educational draft payloads/458 lessons remain `DRAFT_NOT_MODEL_PROMPT_NOT_AUTHORITY`. Content patches/reconstructed materials are not promoted. |

The six website `coreInstructions` strings are not a reconstructed Knowledge Core.
The supplied source-version manifests and restrictions are preserved verbatim in
the private package. Hash checks do not grant architectural or clinical approval.

## What actually executes

```text
existing React conversation store / HTTP transport
  → local Vite API: strict JSON + verified emulator identity
  → existing history/operation authority, IP limiter and account reservation
  → permitted private retrieval + separate preferences → ModelContext
  → hash-bound private Python bridge
  → original ConversationController.prepare
      source/excerpt verification, heuristic triage, structural quote-bound ledger
      original model_messages + original SimulationAdapter
      ScopeGuard, PermissionInspector, MockPolicy, GeneratedValidator
  → original ConversationController.finish
      validator recheck, source/policy/state recheck, MockSink receipt, Session.commit
  → Node checks context/request/worker/output/receipt binding
  → existing completion accounting and response validation → website
```

The website's supporting passages and exact document/version/hash/section/text
reach the wrapper's **constructed structured input**. Its digest is carried in
the Controller decision/ledger context binding. The native `model_messages`
builds its original system context with the six exact proposal-source sections,
and receives the full ordered dialogue with explicit correction cues. Raw website
history and original wording remain intact. Explicit name/address/language
preferences are mapped; other optional fields stay supporting data in the bound
context, not case formulation.

Important boundary: the native `SimulationAdapter.generate(messages, profile)`
only quotes the latest message. It does **not** consume retrieved passages to
produce an informed answer. The wrapper traces their arrival; it does not pretend
that a separate structured context is a model-grounding implementation. A reviewed
contract for including permitted retrieval in a generative adapter is still
missing. No runtime responses come from evaluation-answer fixtures.

Instrumentation delegates to the original implementations. Evidence records
which checks executed, not invented pass labels. `PermissionInspector` uses the
original unconfigured registry and returns `HOLD_ACTUAL_EXECUTION`; mock policy
eligibility is not actual permission. Architecture/clinical/deployment approval
flags remain false. `ScopeGuard` checks format in the MOCK branch and **skips its
semantic rules** there. Ledger quote checks and research triage are not independent
clinical or semantic validation. No complete psychological Controller is claimed.

## Executed evidence

See `docs/evidence/scope-a040/` for current results, including command exit codes.
Execution used Windows, Node 25.2.0, Python 3.12.10 and Java 21.0.13. The declared
Functions production Node 22 runtime was not exercised or activated.

| Check | Result and limit |
| --- | --- |
| Conversation + UTF-8/launcher regressions | 20 passed; includes the existing 17 contract/state/transport checks and 3 focused regressions. |
| Auth/Firestore + consolidation | 15 passed on Java 21; quota concurrency, Vietnam calendar-month boundaries/in-flight completion, guest linking/signout/account switching, cross-user/authority rejection, replay/restart and unchanged IP limits. Google credentials are emulator substitutes. |
| Original Controller integration | 3 passed: synthetic journey, child-process result loss/restart, four native rejection cases. |
| Both builds and touched backend lint | Passed. Full backend lint still has 30 existing `functions/src/index.ts` errors; root config's missing `@eslint/js` is pre-existing. Baseline comparison is recorded separately. |
| Actual browser | Desktop/mobile simulation, multi-turn correction, dropped HTTP response/replay, switching/reset, account flows, six counselling routes/export/share, retreat rendering; no booking submitted. Screenshots are real Chromium captures. OS print/share side effects are stubbed. |
| Production preview / privacy | Sending/emulator auth stay closed. Generated public assets scanned for private/source/emulator canaries; finite scan, not proof against every transformed secret. |

`utf8-before-after.json` shows the original text, actual old corruption and corrected
middleware result. `integrated-journey.json` records invented Vietnamese initial
message, follow-up, explicit correction, a confirmed technical failure/new attempt,
and a dropped completed response replayed with the **same** operation ID and zero
additional adapter calls. It includes retrieved fixture text/references and executed
native checks. It is plumbing/control evidence, not language-quality evidence.

`negative-controls.json` proves the original policy blocks denied/revoked mock
eligibility, empty output fails validation, and changed post-validation bytes are
rejected. These known no-delivery failures refund the reservation. In
`controller-process-loss.json`, the child exits after mock receipt/commit but before
Node sees it: the outcome stays unknown, quota stays reserved, replay cannot run
again, and a server restart rejects the old epoch. No automatic reconciliation,
completion claim or self-issued refund is fabricated.

## Run locally

This workspace has the private package and isolated Python dependencies prepared.
The website is available at `http://127.0.0.1:5173/ai-inspire` while the local
development server and Auth/Firestore emulators are running.

For another checkout, install existing npm dependencies, provide Java 21+ and
Python 3.12, and privately extract the **original, unchanged** supplied ZIP so
`manifests/package_manifest.json` is at
`.private.local/controller040-preview/INSPIRE_AI_040/manifests/package_manifest.json`.
Keep the directory private; do not copy it into `public`, `src` or `dist`. The
bridge expects the pinned received manifest SHA-256
`7e84cef6083755879364d31ed69f8d00305feab0cbcc50a94ef9d5e97753797a`.

Install the preview's required libraries into an isolated Python environment:
`pydantic==2.13.5 jsonschema==4.26.0 httpx==0.28.1`. No additional web framework
is required. On this machine Python is `.tools.local/python312/python.exe`.
For another location/platform set `INSPIRE_CONTROLLER_PYTHON` to the absolute
interpreter path before starting Vite. A private package/dependency failure holds
the request with a technical error; it never enables a model fallback.

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
# Terminal 1, Java 21+ (JAVA_HOME if needed):
npm.cmd run emulators
# Terminal 2, Python path if not using this workspace's portable interpreter:
# $env:INSPIRE_CONTROLLER_PYTHON = 'C:\path\venv\Scripts\python.exe'
npm.cmd run dev -- --host 127.0.0.1
# Terminal 3: all checks; also start preview on 5174 for its closure check:
npm.cmd run preview -- --host 127.0.0.1 --port 5174
# Separate terminal:
node tests/verify-scope-a040.mjs
```

POSIX uses `npm` and `export INSPIRE_CONTROLLER_PYTHON=/absolute/path/to/python`.
The read-only package audit currently also reads the original archive from this
user's supplied Downloads path; adapt that audit-only path on another machine.
Chat/Controller transcripts and caches are memory-only. Refresh clears UI history;
server restart loses result state and fails replay clearly. Auth/preferences/quota
records remain local emulator data under the existing prototype policy. No real
data or database export belongs in a review ZIP.

## Remaining dependencies

- Actual-source runtime-use permission and reviewed source eligibility; provenance
  alone does not supply approval. No canonical document repair is needed here.
- A real permission registry/ActualPermissionRecord and authorized model/adapter
  contract. None is supplied to this offline bridge; actual execution is held.
- Reviewed passage-to-generative-input handling, independent semantic/clinical
  validation, generative Vietnamese quality and real OAuth validation.
- Authorized durable receipt/reconciliation and multi-instance session/result
  contracts. The current bridge intentionally latches process loss; it never
  recreates lost state and silently regenerates an unresolved attempt.
- Production security/retention/deletion/deployment decisions. Scope A is local,
  synthetic and single-process only. No activation switch or approval was added.
