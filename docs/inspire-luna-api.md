# Current private knowledge milestone — 21 November 2026

The preferred route is ChatGPT sign-in. Live dispatch remains blocked; no API-key
fallback is selected. The API handoff below is historical, not a current release.

Run `node tests/start-inspire-emulators.mjs`, then in another PowerShell terminal:

```powershell
node --import ./tests/register-ts.mjs tests/import-inspire-knowledge.mjs --discover
$env:INSPIRE_PRIVATE_TEST = '1'
$env:INSPIRE_LUNA_API_PREVIEW = '0'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open <http://127.0.0.1:5173/ai-inspire?thu-rieng=1>. Use synthetic situations only.
The existing simulation Controller answers; every turn also prepares an exact,
held ChatGPT input with permitted references. Inspect it under **Dành cho con**.
No per-message permission form is needed. Refresh clears conversation memory.
Run discovery again after adding files to the ignored private knowledge inbox,
an INSPIRE directory in Downloads, or an explicit private operator manifest.
Discovery preserves receipts and grants no permission. Binary files are retained
as receipts; only UTF-8 Markdown/text currently receives section extraction.

Evidence: `docs/evidence/knowledge-conversation-2026-11-21/`. The HTTP trace uses
the actual native simulation Controller; the passage trace uses clearly marked
synthetic permitted fixtures. Neither demonstrates generated conversation quality.
All 71 source receipts currently remain ineligible for external model input.
The website reference is internally eligible; its external permission is pending.
The ChatGPT adapter input is prepared, but app-server dispatch, its token cap,
retry controls and zero-additional-charge billing condition remain unverified.
Browser inspection was stopped by Computer Use because the current Chrome URL
could not be determined reliably. No screenshot or visual-pass claim is made.

Proposed next session, not authorized: one synthetic conversation, at most three
model attempts/512 output tokens each, no automatic retries, no additional spend.
Only the existing website-counseling reference is proposed for narrowly scoped
export; all other private originals/drafts/operating rules remain excluded.
The old one-attempt authorization does not apply. A separate release is required
after source permission, billing and app-server controls are established.

# Historical API handoff — 14 November 2026

Generation is **unarmed**. No API credential, owner authorization, source approval
or paid call was created. Public generation and the rejected US$2 trial stay closed.
The current endpoint prepares a preview; a later explicit owner release permits
one synthetic attempt, with no automatic retry or replacement.

## Run

```powershell
# Terminal 1 — existing demo-inspire Auth and Firestore emulators
node tests/start-inspire-emulators.mjs
# Terminal 2 — private interface; this flag enables PREVIEW, not generation
$env:INSPIRE_PRIVATE_TEST = '1'
$env:INSPIRE_LUNA_API_PREVIEW = '1'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open <http://127.0.0.1:5173/ai-inspire?thu-rieng=1>. Under **Dành cho con**, connect
an invented emulator account. Choose **Luna API · Xem trước**, enter the synthetic
question below and press **Gửi**. The exact body, source count, hash, operation
binding and cost appear under **Dành cho con**. No model request has been sent.
Your father can use simulation freely; genuine model testing waits for your
explicit release. Refresh, leaving the page or changing modes clears chat memory.
Feedback is session-only and is not sent to the model.

Existing private original files and their immutable versions are reused. To
refresh receipts/indexes locally, without granting any permission:

```powershell
node --import ./tests/register-ts.mjs tests/import-inspire-knowledge.mjs --controller-originals
```

## API setup and single request

Use a project-scoped **OpenAI API** key, separate from ChatGPT Business/Codex
authentication and billing. In your own editor put it in
`%LOCALAPPDATA%\INSPIRE-Luna\api-key.txt`, in a nonsynced directory restricted to
your Windows account. Do not use Vite variables, the repository, OneDrive, a
browser field or chat. Check the selected API project's billing/recharge settings
yourself; this application enables no purchases or top-ups. Credential access
and entitlement remain unverified. Saving a key does not authorize a call.

Proposed question:

> Tình huống giả định: Tôi có một ngày nhiều việc. Giúp tôi chọn việc nên làm trước.

The [exact request and cost](evidence/luna-api-2026-11-14/proposed-single-request.json)
include a short engineering instruction in Vietnamese, this question, neutral
language preference and message references. Source and correction lists are empty.
No private INSPIRE documents, proposed operating rules, profile, UID, email,
Firebase token, booking, attachment or real client data is included. Destination:
`https://api.openai.com/v1/responses`; API authentication, standard SDK headers
and network metadata also leave the computer. `store:false` is not a claim of
zero provider retention.

[Official Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
and [pricing](https://developers.openai.com/api/docs/pricing) were checked on
14 November: standard input US$0.10/output US$0.50 per million tokens. The
reservation uses the higher US$0.25 input rate to cover cache writes, UTF-8 body
bytes plus 4,096 framing tokens, and all 512 allowed output tokens. It is a
conservative estimate, not an observed invoice. Pricing expires in code on
21 November and must be rechecked before later execution.

Only after your explicit request/cost approval may the technical supervisor
configure the exact hash/binding authorization in the nonsynced local directory
and manually select **Kiểm tra quyền và gửi lượt này**. No authorizing file was
created in this milestone. The preview expires after 30 minutes; authorization
must be current and last at most one hour. This is a first-test engineering gate,
not a new canonical reviewer or per-turn content-approval procedure.

Stop after one attempted call: success, failure or unknown outcome. An exclusive,
fsynced `first-attempt.json` marker consumes the release before dispatch. Restart
does not grant another attempt. Replay returns only an existing result; a lost
result is held, never regenerated. Unknown outcomes keep quota reservations.
Host administrators can still delete/roll back their own storage; protection
against a malicious administrator or unexpected provider pricing is not claimed.

## Verified boundaries

- Ordered roles, original wording and correction IDs stay intact. Only the
  derived retrieval query excludes superseded user messages; assistant guesses
  are not retrieval authority. History is rejected if oversized, never shortened.
- Eligibility and exportable search terms are indexed before the 50-document
  candidate limit. Drafts and operating-rule documents stay private. Results are
  at most three exact 1,400-character sections, with source/version/hash/line
  references. Empty retrieval remains empty. This is lexical, not semantic search.
- Document/permission imports preserve immutable history and invalidate caches.
  Permission-only updates work without rereading originals. Exact current export
  permission is checked again before dispatch. Optional excerpt hashes constrain
  narrow grants. All nine proposed source excerpts remain unauthorized.
- Existing account quotas, IP limits, session epochs and retry identities are
  reused. SDK retries are zero; redirects are rejected; no inherited API key,
  organization, project or alternative provider is used.
- Original Controller triage, non-MOCK ScopeGuard, generated HMAC, exact-byte sink
  checks and receipt binding execute offline. Catalogue checks are unchanged.
  Actual-execution/user-delivery permission remains held; the private UI is only
  a quarantined synthetic evaluation surface, not public or clinical permission.
- Conversation/generated bodies remain in memory. Only hashes, attempt/cost
  metadata and existing account records persist. Private files are denied by
  Vite and excluded from public assets and the review ZIP.

## Evidence and limits

[Executed checks](evidence/luna-api-2026-11-14/executed-checks.json),
[adapter-input trace](evidence/luna-api-2026-11-14/adapter-input-trace.json),
[Controller trace](evidence/luna-api-2026-11-14/controller-trace.json), and
[HTTP checks](evidence/luna-api-2026-11-14/http-verification.json).

```powershell
# For the full verification also run production preview on 127.0.0.1:4173
# after a local npm.cmd run build. Neither command deploys anything.
npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort
# In another terminal:
node tests/verify-inspire-luna-api.mjs
```

Tests use only synthetic fixtures and injected/intercepted model transports.
Windows research-storage regressions require the local owner's protected ACL
access. Native tests require the already-present private Controller package and
Python dependencies; these private documents/portable runtimes are not in the ZIP.
Use Node 24 LTS and Java 21+; this run used installed Node 25.2.0, Vite 7.2.2,
OpenAI SDK 7.10.0 and Python 3.12.10, with lockfiles retained.

Browser visual checks are **NOT VERIFIED**: the browser access host is unavailable.
Manual checks: desktop/mobile selector and preview readability, message separation,
corrections, conversation switching, reload clearing and feedback controls.
HTTP verification is not a rendered-browser or screenshot claim.
An earlier parallel test run reached the bounded 20-second native preflight hold;
its log is retained. The serialized shared-emulator suites passed, including
their explicit concurrent-request regressions. Slow native validation remains
fail-closed.

Remaining: your single-request release, local API key/billing/entitlement checks,
the first real provider receipt and your father's Vietnamese quality review.
Simulated responses establish neither generative quality nor clinical validation.
