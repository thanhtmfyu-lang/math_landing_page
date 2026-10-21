# NM8 lead-status gateway — draft, not deployed

Production metadata read on 21/10/2026 found the four existing J33 pending/mark
RPCs but no RPC that changes the four NM8 statuses. This change adds one Edge
function and pending migration 093; it does not reuse migration 092 or student
profile labels from PR 62. No live migration, deploy, lead change or send was run.

After the release owner applies pending migration
`202610210093_nm8_lead_status.sql` and deploys `mtm-lead-status`, the worker calls:

`POST https://egljwujhgdapaxyrjskj.supabase.co/functions/v1/mtm-lead-status`

Headers: `Authorization: Bearer <existing MTM_LEAD_JAVIS_TOKEN>`,
`Content-Type: application/json`. Read the existing token in the VPS runtime;
never copy it into a bridge letter, source, request receipt or log. This token
is a worker capability, not evidence of a human UID. Edge uses its platform
service-role environment to call only `mtm_lead_nm8_status(text,jsonb)`; that RPC
checks `mtm_lead_javis_kiem(p_token)` again. Function config explicitly sets
`verify_jwt=false` because the J33 token is not a Supabase JWT; DB performs the
worker-token authentication. The RPC is not granted to anon or
authenticated. No new token, account, broad grant or Vercel function is needed.

Read current state without mutation:

```json
{"action":"get","leadId":"11111111-1111-4111-8111-111111111111"}
```

A previously unlabelled lead returns `current: null`, rather than a guessed
status. Set command (all eleven keys required; class/date null except CHINH_THUC):

```json
{
  "action":"set",
  "leadId":"11111111-1111-4111-8111-111111111111",
  "eventId":"22222222-2222-4222-8222-222222222222",
  "expectedStatus":null,
  "expectedEventId":null,
  "status":"HOC_THU",
  "className":null,
  "effectiveDate":null,
  "source":"manager",
  "actorRef":"gate:opaque-actor-hash",
  "sourceReceipt":"receipt:verified-source-id"
}
```

Statuses: `HOC_THU`, `DA_HOC_THU`, `CHINH_THUC`, `KHONG_HOC`. For CHINH_THUC,
require className and an actual ISO calendar date (e.g. `2026-10-24`). Source is
`web`, `bot-zalo`, `manager` or `l10`. actorRef/sourceReceipt are opaque audit
references, never names, phone numbers, tokens or the source chat itself.

The existing worker must authenticate sender/group/actor through its current
source gate **before** issuing a set. Neither these audit strings nor eventId
authenticate a human. For L10, resolve the actual registration/account before
calling; a Zoom display name alone is insufficient. This endpoint does not add
ingestion, account creation or sender-authentication mechanisms.

All states accept explicit authorized updates with compare-and-set; no unknown
business transition policy is invented. Read first and pass the observed
expectedStatus and expectedEventId (current.last_event_id; both null before the
first state). Both are checked, including same-status class/date corrections.
A conflict returns 409 and changes nothing. Never retry by silently changing
either precondition. Identical event+command returns the
original eventState with `replayed:true`, without another event; a different
command using the same event returns 409. eventState is the state committed by
that event; use get for the current state after later events.

Use lowercase UUID strings consistently; retry the identical command byte for
byte at the JSON value level. State and append-only before/after history commit together under row/event
locks. No existing lead fields, NM progress, handled_at, sheet columns, prices,
accounts or credentials change. There is no delete endpoint. A correction is a
new authorized event with current expectedStatus; history remains.

Same state/class/date under a new event returns `changed:false` and records an
audit event without updating current state. Do not notify for that event.

Worker continuation: wait for a release receipt before using the new URL. Then
use a controlled TEST lead under the existing NM/J33 path; get → set → get
readback → Sheet write/readback → current approved manager gateway. Do not send
for failed writes or `changed:false`. After timeout/503, retry the same eventId
and exact command to resolve an uncertain commit. For `replayed:true`, still
reconcile state/Sheet and notification receipts; a committed event may have lost
its first response. The existing sender's durable receipt by eventId decides
whether to send, suppress or hold an uncertain delivery. A replay flag alone
does not decide delivery. Never resend blindly. Write Sheet values with RAW
to prevent class labels becoming formulas. An HTTP retry/idempotent DB response
does not prove exactly-once external delivery. The endpoint sends no messages.

No delete/gather-lead helper was found in the live public mtm_lead RPC catalog;
the foreign keys intentionally restrict deleting an audited lead. Future
retention/merge work must preserve the event history explicitly. Local PGlite
tests use a mock token and one session, so concurrent-session behavior, Supabase
role defaults, actual Edge auth and sender/Sheet integration remain release QA.

Responses: 200 committed/read/replayed, 400 invalid command/date, 401 invalid
worker token, 404 unknown lead, 409 event/status conflict, 503 DB unavailable.
No success send may follow non-200 or failed readback. Local fixtures do not
prove a live four-source/four-status NM8 run.
