# Literature triage triage-2026-09-01-ofrd

Judged watch run watch-2026-09-01-f8n3 on 2026-09-01 (model anthropic/claude-fable-5, watch-triage-v1).

- **immortality-key**: 1 item(s) → 0 import, 0 shelf, 1 archive.

## Ground rules

- AI-generated decisions, recorded with reasons — drafts, not judgments of record.
- Imports only queue a verification request (inbox link drop); the ledger admission rule (a source enters sources.yaml only when an evidence record cites it) is enforced at build time regardless.
- A watch-flagged possible duplicate can never be imported by triage; the guard runs in code.
- Shelf candidates await an agent adding them to the case's resources.yaml.
- Archived items are also recorded, one line each, in `proposals/watch/archive-ledger.yaml` — the cumulative audit trail that survives run expiry, so omissions can be reviewed later.
- Fully revertable: delete proposals/watch/watch-2026-09-01-f8n3/triage.yaml and any inbox/triage-watch-2026-09-01-f8n3-*.md drops.
