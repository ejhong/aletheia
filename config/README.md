# AI operating policy

[ai.json](ai.json) sets the models and recorded tariffs for the repository's API workers.
The **AI budget report** Actions workflow controls the live spending allowance.
The initial recommendation is **$150 per UTC calendar month, $25 per UTC day**,
with **$30 of the month kept for independent review**. These are ceilings,
not spending targets. The monthly total includes reviews; the reserve is not
an additional $30. Non-review work can use at most $120. Existing source,
call-count, time, and publication-pace limits still apply inside this allowance.

The main writer is **GPT-6 Astra, medium effort**, using Responses with explicit
input and a 64,000-token output ceiling including reasoning. Extraction,
watch triage, agenda proposals, reassessment, and existing editorial workers
share that client. The small source drafter and separate source checker keep
their bounded roles. The five independent panel seats remain in
`scripts/lib/vendors.mjs`; their models and concurrence rules are unchanged.
The Claude Code operator stays on its existing action, now pinned to Opus 5
and connected through a metered adapter on its Actions runner. Images use
the existing generation script and the same shared allowance.

## See and change the budget

Run **AI budget report** from the repository's Actions tab for a model-free
report. Paid workflow jobs also put this report in their step summary. It
separates drafting, research, review, operator, and images, with outstanding
reservations shown separately from settled usage.

```sh
npm run ai:budget -- config
npm run ai:budget -- status
npm run ai:budget -- status --json
npm run ai:budget -- set --monthly 150 --daily 25 --review-reserve 30
```

`set` changes the live allowance on the spending branch, without an AI call or
publication PR. In Actions, select **set** and enter new limits, or choose
**pause** / **resume**. Unspecified amounts stay unchanged. The recorded history
identifies each change. This control still works when every paid worker is
paused or out of funds. It does not change any publication rule.

The initial allowance in `config/ai.json` is used only for first-time setup.
Subsequent budget changes go through the workflow or CLI; model and tariff
changes still use the ordinary code-review gate. A model-policy PR cannot
fund itself by changing an unapproved tariff. New reservations read the
approved model policy and live allowance. Running requests keep their admitted
terms; use the Actions kill switch to cancel them immediately.

Local paid runs require the provider key and `BUDGET_GITHUB_TOKEN`, a GitHub
token with repository contents write. Actions use the existing
`MAINTENANCE_PAT`. Before the first paid run, initialize the separate spending
branch once with `npm run ai:budget -- init`. For the first integration, this
also records the live allowance and founder-authorized bootstrap model policy, valid only until a model policy has first appeared in the history of `main`.
Unrelated changes to cases do not invalidate that starting authorization. Once `config/ai.json` exists on
`main`, that approved file supplies model policy; the bootstrap is never a fallback
for deleting it later. Do not make a private local copy
of the spending file: local and scheduled runs must share the same allowance.

## How accounting works

Each request reserves its maximum admitted liability **before** contacting the
model. GitHub's file-SHA comparison serializes reservations from concurrent jobs
in `automation-budget:months/YYYY-MM.json`; conflicts re-read and retry. A lost
write acknowledgement uses the same reservation ID. The spending branch is
operational state and does not change the site's evidence or publications.

Returned usage releases the unused reservation. Tokens, model, rate date,
tariff, bounds, and workflow run are recorded; prompts, source text, and API
keys are not. Missing usage, network failures, cancellation, and failed HTTP
attempts retain their reservation. Each retry must obtain a new one. Unknown
models, inaccessible accounting, invalid receipts, and exhausted allowance
stop paid work. They never remove a panel seat's independence or lower the
publication threshold. A reservation is charged to its UTC admission date,
even if the request finishes after midnight. A new month does not rewrite old
receipts or assert that an unsettled request was free.

This is **conservative tariff accounting, not the provider invoice**. Cache-read
discounts are not assumed; cache creation and long-context premiums are included.
Gemini is accounted at its announced post-promotion tariff, so the allowance
does not become insufficient when the introductory price ends. Other model
tariffs must be reviewed when providers change their prices. Astra uses the
provider's input counter plus explicit framing headroom; other text calls
reserve their complete context ceiling. The current image adapter admits one
high-quality 1536×1024 image at a time, a prompt of at most 16 KB, and a
conservative 32K-input / 6,400-output token allowance. Those image bounds are
adapter allowances, not a claim about the model's context-window size.

The operator adapter admits only its pinned model, standard processing and
client-executed tools. It meters each Messages request, including streaming
usage and retries. Paid hosted search, code execution, or other new tools need
their own tariffs before being enabled. Edition drafting uses the shared client.
The bounded Expedition pilot now admits `web_search` for the configured small
source drafter. Astra plans the question and selects useful returned leads.

`discovery` sets the enabled cases, revisit interval, query and lead limits.
Initially this is Deep Memory, seven days, two planned queries and two leads. Each
lookup uses one stateless request with `max_tool_calls: 1`. The hosted tool can
expand a planned query into multiple search strings, retained in its receipt; discovery authors have an
8,000-token output limit and the scout 4,000. The existing source reader keeps
its separate four-call / four-minute / $1 limit. Discovery has a ten-minute
deadline and shares the global allowance; no additional monthly budget is added.

`webSearch` records $0.01 per tool call, with retrieved content billed as model
input. The reservation covers two full model input passes plus the tool fee,
rather than guessing a token cap from `search_context_size: low`. Actual token
and completed-tool receipts settle it; missing or unexpected tool usage retains
the hold. Discovery cost terms also include case, operation run and phase.
These bounds follow the [Responses tool-call limit](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
and [OpenAI tool pricing](https://developers.openai.com/api/docs/pricing), checked
2026-09-07. Search outputs remain discovery leads until separately read and checked.

The source reader can attach a public PDF of at most 10 MB / 60 pages to both
its drafting and checking calls. It still reserves the whole model input context
before each request and accounts for returned usage, including page-image tokens.
There is no Files API upload or storage charge introduced by this adapter. See
[OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
for the inline PDF format and image/text token treatment (checked 2026-09-07).

Accounting begins with this integration. Earlier bills cannot be reconstructed
from workers that discarded usage. ChatGPT/Codex subscriptions, this interactive
development session, unrelated projects using the same API keys, taxes, and
other provider charges outside these workers are outside this repository's
allowance. Provider billing dashboards remain the invoice reference. An
unsettled reservation can be reconciled only against a real provider receipt,
with that correction preserved in spending-branch history; never clear it
merely to make another run fit.
