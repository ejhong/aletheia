# Literature triage triage-2026-08-27-yb5k

Judged watch run watch-2026-08-24-7806 on 2026-08-27 (model anthropic/claude-fable-5, watch-triage-v1).

- **ccc**: 15 item(s) → 0 import, 0 shelf, 15 archive.
- **geopolymer**: 4 item(s) → 0 import, 0 shelf, 4 archive.
- **mpi**: 1 item(s) → 0 import, 0 shelf, 1 archive.
- **orch-or**: triage FAILED closed (1 problem(s)) — 10 item(s) left undecided; re-run with `--run watch-2026-08-24-7806` to retry (deterministic filenames make a retry overwrite, not duplicate).
- **transients**: 5 item(s) → 2 import, 0 shelf, 3 archive. Importing: “Statistically Significant Linear Alignments Among High-Confidence Transient Candidates on POSS-I Photographic Plates”; “Machine Learning Supports Existence of Previously Unrecognized Transient Astronomical Phenomena in Historical Observatory Images”.
- **ydih**: 4 item(s) → 0 import, 0 shelf, 4 archive.
- **zero-worlds**: 3 item(s) → 1 import, 0 shelf, 2 archive. Importing: “Derivation of the Born Rule and Operational Quantum Formalism in the Accessibility Framework through Boundary Reduction”.

## Ground rules

- AI-generated decisions, recorded with reasons — drafts, not judgments of record.
- Imports only queue a verification request (inbox link drop); the ledger admission rule (a source enters sources.yaml only when an evidence record cites it) is enforced at build time regardless.
- A watch-flagged possible duplicate can never be imported by triage; the guard runs in code.
- Shelf candidates await an agent adding them to the case's resources.yaml.
- Archived items are also recorded, one line each, in `proposals/watch/archive-ledger.yaml` — the cumulative audit trail that survives run expiry, so omissions can be reviewed later.
- Fully revertable: delete proposals/watch/watch-2026-08-24-7806/triage.yaml and any inbox/triage-watch-2026-08-24-7806-*.md drops.
