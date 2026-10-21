# v133 — response provenance, preference retention, related-question filling

## Verified reuse paths and limits of diagnosis

No full-answer cache or welcome-row response preset exists. Welcome rows call
the same new-chat → route → ask → POST /api/chat path as typed input. The API was
already no-store. Unsafe replay paths were localStorage history and shared-hash
restoration: they restored assistant body, answer_plan and relatedQuestions with
no rules-version or age check. Mutable JavaScript assets also had a one-year
immutable cache policy. These paths can reproduce stale UI. We did not inspect
the reporting user's browser storage/network, so the single trigger of that
particular welcome-row report is not established.

## Invalidation and fresh composition

`worker/response-rules.js` is shared by server/browser. RESPONSE_RULES_VERSION is
exposed as VERSION=v133, with a one-hour TTL. New responses/state carry version
and generatedAt; responses also carry X-Response-Rules-Version. An explicitly
outdated client version receives 409 before generation and a reload action.
Different-version/expired state cannot reuse old candidates. The bounded
existence cache uses version-prefixed keys and prunes other versions, expired
entries and entries beyond the one-hour maximum (normal positive TTL 3 minutes,
negative TTL 15 seconds). It stores booleans, not prose or user credentials.

Archived old/expired assistant records are preserved, but their saved body,
cards, answer_plan and related questions are not rendered as current responses
or fed into a new request. Instead an explicit current-rules regeneration button
starts a fresh request using the preceding user input. User history is not
deleted. Current candidates may be retained; copy, links, answer_plan and related
questions are recomposed on each API request. HTML and mutable JS are no-store;
versioned rule/map script URLs and Clear-Site-Data: "cache" invalidate old HTTP
cache without clearing localStorage history.

## Optional conditions

The former condition-only search included companion in its query, then replaced
the previous three results with the new smaller pool. A fresh current-version
pool with unchanged food/region is now preserved first. Three retained places
skip the main search; a smaller pool searches only to fill gaps. Lookup failure
keeps retained results. Original candidates pass food/region validation again.
Only confirmed private-room/parking facts may change priority; unknown facts do
not filter. The model cannot drop retained IDs. Food/region changes and explicit
"other places" keep their normal search/exclusion behavior. Optional-condition
notices remain. No taste, rating or group suitability is invented.

## Related-question count

Target: two with a pending question, three otherwise. Prefer distinct, less
recent axes. Failed existence checks are filled from verified named-card
detail/comparison questions; no ordinal references or service FAQ padding.
Separate real-card detail keys may share an axis only as a shortage fallback,
marked fallback:true. Session semantic deduplication, 40-character full-name
limit and two-round template-repeat guard still apply. If all valid pools are
exhausted (e.g. too-long names plus no successful alternative search), safety
takes precedence: do not fabricate questions merely to reach the target.

## Validation

`node scripts/build-worker.mjs` and `node scripts/policy-smoke.mjs` pass, including
all previous mocked regressions and the new v133 suite: version/TTL/cache-key
invalidation, old-client 409, stale archive isolation, repeated prompt fresh
generation, three→three companion refinement, named-card fallback two/three.
The existing welcome five-row integration suite still exercises actual client
handlers and rendering. Mocked timing shows condition-only main search at 0 ms
(no claim about production AI latency). No API key files were checked and no
live AI/Naver evaluation was run. Browser pixel rendering/live conversational
verification was not performed in this change.

## Changed files

- worker/response-rules.js; dist/assets/response-rules.js
- worker/index.template.js; worker/response-modes.js; worker/related-questions.js
- dist/index.html; scripts/build-worker.mjs
- scripts/v133-regression-smoke.mjs; scripts/policy-smoke.mjs
- scripts/turn-policy-smoke.mjs; scripts/v132-regression-smoke.mjs
- scripts/related-questions-smoke.mjs; docs/response-provenance-v133.md

Generated Worker/server assets are rebuilt for the deployment archive. Site
audience remains public. Deployment version is recorded by the Sites publish
result rather than inferred from the response-rules constant.
