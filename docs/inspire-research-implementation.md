# Controlled research runner — implemented 10 November 2026

The local research runner is implemented and tested offline. It is separate from
the website and Firebase exports. **No real trial is released, no source grant
has been imported, no API credential has been read and no paid request has run.**
The existing public simulation and disabled website generative adapter remain
unchanged. This document describes the implementation, not a new trial proposal.

## What runs

`functions/inspire_research_cli.py` drives `inspire_research.py`. Presentation is
the operator CLI; the runner owns state; `inspire_research_live.py` owns the
optional one-request HTTPS boundary; `inspire_research_controller.py` reuses the
original 0.4.0 checks on a sealed candidate. Nothing is exported through
`functions/src/index.ts` or imported by the website.

* The default transport mechanically echoes the last synthetic user turn. It is
  labelled offline and is neither an answer catalogue nor a generative model.
* Exactly the existing four frozen three-turn cases are available. Ordered
  user/assistant history, explicit correction references, separate addressing
  preferences and reference provenance reach the constructed input. No silent
  truncation, custom participant text, tools or additional cases are accepted.
* The opt-in HTTPS sender uses only `api.openai.com:443/v1/responses`. It has no
  retry, redirect, proxy inheritance or automatic replacement. Its request bytes
  and HTTP behavior were tested with a fake connection, not the real endpoint.
* Before real dispatch: frozen code/source/scenario hashes; externally supplied
  owner decision pinned by SHA and reference; nine separate internal/export
  decisions; two named reviewers; expiry/revocation; synthetic registered local
  identity; existing account/IP admission; exact recent preview acknowledgment;
  payload-bound verified token-count receipt; durable call and money reservation.
  An API key or `--real-model` alone cannot open these gates.

## Durable limits and unknown outcomes

The cap is 12 attempts and 2,000,000 micro-USD (US$2), only reducible. Each attempt
irrevocably reserves 160,000 micro-USD before transport: twelve attempts reserve
US$1.92. The reserve is never recycled for an error or cheaper response. A unique
conversation/turn slot and globally unique operation ID prevent replacement or
redispatch. One outstanding/unreviewed attempt blocks another trial turn.

Input must have an independently verified, exact-payload token upper bound of at
most 8,000; output is capped at 2,048 tokens including reasoning. Integer
all-in rate ceilings and fixed fees must fit the reservation. Actual reported
input/output/cache usage is recorded with a conservative cost ceiling and an
explicitly non-invoice estimate. The offline byte counter is **not** accepted as
a real-model tokenizer. No tokenizer or provider count endpoint is downloaded
or invoked. Current all-in prices/fees and count/framing evidence still need
independent verification before any actual trial.

SQLite transactions and an interprocess file lock serialize reservations. A
separate DPAPI-protected HMAC/sequence anchor detects DB-only rollback, tampering,
clock rollback, missing storage and interrupted anchor updates. These conditions
hold the trial; the code never resets the ledger to regain allowance. A crash
before or after transport leaves a consumed reservation. `recover` halts an
unresolved intent; `replay` returns only an already validated stored result and
never calls transport. A timeout/unknown result stops the entire trial. No
provider-side reconciliation or retrieval call is made automatically.

This is a trusted local operator design. An administrator/current user can
modify code or restore both DB and anchor together. There is no remote monotonic
counter protecting against that deliberate whole-folder rollback. Owner files
and token receipts are externally supplied evidence, not digitally authenticated
approvals created by this code. Named review entries are operator attestations,
not independent reviewer logins.

## Quarantine and retention

Windows is currently the supported platform; others fail closed. Storage is
restricted to `%LOCALAPPDATA%\INSPIRE-Research\<storage-name>` on a fixed local
disk, with a protected current-user-only DACL and per-record current-user DPAPI
encryption. The path is obtained through the Windows known-folder API. Workspace,
public, UNC, known sync roots, reparse and offline paths are rejected. Sync roots
are checked against environment settings and the Windows SyncRootManager; an
unknown third-party backup/sync agent cannot be proven absent by this code.

Default retention is seven days after the trial ends/expires; it can be shortened
to 1–7 days. All CLI commands purge expired content before reading it, and replay
denies expired content. Purge clears candidate text, payload/history, validation
state, reviews, owner/source disclosures and token receipts. Only budget/slot/
operation tombstones remain, preserving the no-reset limit. SQLite secure-delete
is enabled; this is not a promise of physical erasure from SSDs or backups.

The tested `retention-watch` foreground worker checks and purges at most every
60 seconds and exits when content has expired. **No background deletion task has
been installed.** Keep that worker running, or arrange a local scheduled invocation
of `purge` and verify it on the selected machine. Without a running worker/task,
ciphertext remains until the next CLI invocation, although the runner refuses
expired content. Do not redirect disclosure/replay output into
OneDrive, public folders or logs. Candidates are never served by a web endpoint.

## Controller and evaluation boundary

The original 1,234-file package manifest is verified before loading. The sealed
candidate passes native triage, quote-bound ledger, non-MOCK ScopeGuard,
PermissionInspector, GeneratedValidator, exact-byte/source/policy rechecks and
receipt-bound Session.commit. Its native MockSink receipt is explicitly a control
test receipt; `actual_execution_eligible` remains false. Native internal source
assembly is never forwarded to the research transport. Existing catalogue rules
and permission files are not weakened or edited.

Candidates remain quarantined. Two configured review entries bound to the exact
validated SHA are required before text joins *research-only* subsequent history.
Each scores naturalness, relevance, continuity and preferences (1–5), and records
invented facts/sources, unsafe content, authority claims and privacy leaks. Any
flag, rejection or score below 3 halts the trial. Completion requires all 12 turns,
24 reviews, means at least 4 and no score below 3. Native rejection, wrong model,
wrong response binding, invalid usage, refusals, tools, incomplete/oversized
output, loss of storage/authorization or unknown outcome also holds/stops the run.
Mock scores test this workflow; they establish no conversation or clinical quality.

## Run locally (no API key)

Executed dependencies: Windows; Node 25.2.0; Python 3.12.10 with pydantic 2.13.5,
jsonschema 4.26.0 and httpx 0.28.1 for the unchanged private Controller; Java 21
for existing Firebase emulators. The new store/HTTPS sender use Python's standard
library. Existing npm lockfiles remain unchanged by this task. The verified
private package must remain at the existing `.private.local/controller040-preview/INSPIRE_AI_040` path.

```powershell
# Terminal 1, for the shared account/IP integration tests only:
npm run emulators
# Terminal 2, executes and records the complete offline verification:
node tests/verify-inspire-research.mjs
# Actual CLI smoke journey, no key or source grants:
node tests/inspire-research-cli-smoke.mjs

# Independent manual offline conversation:
$py = '.\.tools.local\python312\python.exe'
& $py -X utf8 functions/inspire_research_cli.py init-offline --trial my-offline --storage-name my-offline-v1
& $py -X utf8 functions/inspire_research_cli.py preview --trial my-offline --storage-name my-offline-v1 --conversation C1
# Use the preview's exact body_sha256; re-preview if its 120-second window expires.
& $py -X utf8 functions/inspire_research_cli.py execute --trial my-offline --storage-name my-offline-v1 --conversation C1 --preview-hash '<body_sha256>' --operation my-op-1
& $py -X utf8 functions/inspire_research_cli.py replay --trial my-offline --storage-name my-offline-v1 --operation my-op-1
& $py -X utf8 functions/inspire_research_cli.py purge --trial my-offline --storage-name my-offline-v1
# Optional separate terminal; keep open to enforce unattended local deletion:
& $py -X utf8 functions/inspire_research_cli.py retention-watch --trial my-offline --storage-name my-offline-v1
```

Use a fresh leaf/trial for an independent offline demonstration; this is not a
way to restart an approved real trial. The CLI smoke script also demonstrates
the two fixture reviews via `--review-json -`. Do not use those artificial ratings
for an actual model candidate. Existing account/IP quotas apply through a private
stdin-only Node bridge; its synthetic Auth token never enters the quarantine or
command arguments. Shared-admission failure stops dispatch. No production auth
or real OAuth was exercised.

Preserved IP limits are 10 attempts per 10 minutes and 30 per rolling day. Pace
an actual 12-turn trial accordingly, including the cooldown before attempt 11;
the research runner does not bypass these limits. A failed shared reservation
consumes the conservative trial intent and stops the run rather than replacing it.

## Exact material still requiring approval

All nine decisions below remain **false for internal research use and external
API export**. Full file/section hashes and unresolved authority/version issues
remain in the unchanged [owner matrix](evidence/research-trial-plan-2026-11-10/owner-decision-matrix.json).

| Exact section | Proposed role/schedule, only after explicit individual consent |
| --- | --- |
| MOI-01 XCII — Foundational Conversational Support | Operating rule; all 12 instruction blocks |
| MOI-01 XCIII — Formulation-Oriented Inquiry | Operating rule; all 12 instruction blocks |
| MOI-01 CLVI — Internal State ≠ User-Facing Response | Operating rule; all 12 instruction blocks |
| MOI-01 CLVII — User-Facing Response Should Be Natural | Operating rule; all 12 instruction blocks |
| MOI-01 CLIX — Do Not Dump Hypotheses as Labels | Operating rule; all 12 instruction blocks |
| MOI-01 CLXIII — Language of Unknown | Operating rule; all 12 instruction blocks |
| INSPIRE-02 §4 — WHAT là dữ liệu trước khi là diễn giải | Reference only; C3 turns 1–3 |
| INSPIRE-02 §6 — Ba lớp cần tách trong dữ liệu WHAT | Reference only; C3 turns 1–3 |
| INSPIRE-02 §93 — Người dùng có thể thay đổi cách gọi WHAT | Reference only; C2 turns 2–3 |

Read the exact received text locally, without granting anything:

```powershell
& $py -X utf8 functions/inspire_research_cli.py init-draft --trial owner-review --storage-name owner-review-v1
& $py -X utf8 functions/inspire_research_cli.py source-disclosure --trial owner-review --storage-name owner-review-v1
& $py -X utf8 functions/inspire_research_cli.py approval-disclosure --trial owner-review --storage-name owner-review-v1 --conversation C3
```

`source-disclosure` returns all nine verbatim sections with exact hashes and
pending metadata. `approval-disclosure` returns the complete proposed first-turn
JSON body, byte count and SHA. It is labelled **not dispatchable** and does not
create an execution preview. The four first-turn bodies are regression-checked
against runtime composition without granting any source rights. Later turns
necessarily depend on quarantined, reviewed generated responses; the runner shows
and requires acknowledgment of each resulting exact body before dispatch.

The proposed outbound data remains the frozen [template and synthetic turns](evidence/research-trial-plan-2026-11-10/outbound-template-proposal.json):
engineering instructions, the six individually permitted operating excerpts,
scheduled permitted references with hashes/status, synthetic ordered history,
correction references and synthetic addressing preferences. The sole provider
request uses `gpt-6.1-sol`, low reasoning, 2,048 output tokens, `store:false`,
`stream:false`, `background:false`, `truncation:disabled`, default tier and no tools.
Headers carry the API credential and opaque operation ID; the provider also sees
normal account/billing/network IP/TLS metadata. `store:false` is not a claim of
zero provider retention. Real client/profile/identity data, emulator tokens,
private corpus beyond the nine exact grants, draft lessons/content patches,
reconstructed MOI-01-A, bookings and website traffic are excluded.

## Evidence and remaining dependencies

| Executed check | Result |
| --- | --- |
| Research safeguards, native controls, fake HTTPS, retention and fault recovery | 27/27 passed |
| Shared research Auth/IP/quota integration | 2/2 passed |
| Existing account/month-boundary/concurrency/restart/access regressions | 10/10 passed |
| Existing generative interface/catalogue controls | 7/7 passed |
| Existing conversation/correction/retry/binding tests | 17/17 passed |
| Actual operator CLI journey | Passed, including draft denial and replay |
| Chat/backend lint; Functions build; website build; public-asset canary scan | Passed |
| Existing lint baseline | 30 booking errors identical to Git HEAD; zero introduced backend errors. Unchanged root config still lacks `@eslint/js`. |

Executed results and exact commands: [executed-checks.json](evidence/research-implementation/executed-checks.json).
Fault traces: [offline trace](evidence/research-implementation/offline-trace.json),
[shared admission](evidence/research-implementation/shared-admission-trace.json),
[actual CLI journey](evidence/research-implementation/cli-smoke-trace.json).
The focused patch and preservation audit are in the same evidence directory.

Before the first paid attempt, the owner must supply explicit trial/export
decisions with authority evidence and exact hashes; confirm the source snapshots,
amendments and examples' export rights; select two reviewers and local storage/
retention supervision; and separately authorize release. Technical dependencies
are verified model tokenizer/framing receipts for each exact request, current
all-in price/tax evidence within the reserve, model/project access and a later
secure project credential. No verified real token receipts or owner grants exist
in this implementation. The receipt importer deliberately blocks rather than
guessing. The actual model HTTP contract, account availability, generated quality,
provider retention conditions and end-to-end authorized live run are unverified.

No new public delivery permission, clinical validation, genuine OAuth validation,
deployment permission or authoritative status for any source is established.
