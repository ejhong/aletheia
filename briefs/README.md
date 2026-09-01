# Raw chat-brief captures (science cases only)

These are RAW HTML snapshots of ChatGPT share pages from the founder's
chat-seeded discovery runs (docs/CHAT_BRIEFS.md), committed here as
durable archives by founder decision (2026-08-30). Checksums and
capture metadata live in the table below.

**What these are NOT:** they are not sources, not content, and not
citable by anything — the same never-citable status as every discovery
brief. They contain unverified, model-generated text. No case record
may cite this directory; case records cite the primary sources that
verification recovers from these captures.

**Scope rule:** only science/history cases may be archived here (this
repository is public). Captures for cases touching living private
individuals are never committed to a public repository, per the
downstream deployment's living-persons rules.

**Why raw HTML:** the share page's embedded data carries every citation
URL the chat encountered — the readable rendering drops them. Share
links are snapshots that do not extend as the chat continues, so
successive checkpoints overlap; overlap is deduplicated at
consolidation.

| File | Case | Share URL | Captured (UTC) | md5 |
|---|---|---|---|---|
| hancock/checkpoint-20260901-6a962cd8.html | Hancock dossier (forked twin A, later checkpoint) | chatgpt.com/share/6a962cd8-26ec-83ea-b45e-62dccd9f0cc6 | 2026-09-01 | 84b967a844bd4df94cd21ead7ea8e1db |
| hancock/checkpoint-20260830-6a93a3ce.html | Hancock dossier (forked twin B) | chatgpt.com/share/6a93a3ce-cb08-83e9-b170-36ba77d56ade | 2026-08-30 | 689a7f7ca8b628ff9656f173c020f820 |
| cast-vs-carved/checkpoint-20260830-6a942eec.html | Cast-vs-carved (A) | chatgpt.com/share/6a942eec-0e20-83e9-bd70-40930a2d1fe6 | 2026-08-30 | 16a6f119e3f3cf24a274918e1a194477 |
| cast-vs-carved/checkpoint-20260830-6a942f07.html | Cast-vs-carved (B) | chatgpt.com/share/6a942f07-c330-83ea-a447-4d97dae984b3 | 2026-08-30 | 16ae05ed9f5c6ca5945cf13d09b93af0 |

The two Hancock captures are simultaneously-running forks of one
project (to be merged at consolidation, with divergences preserved as
divergences); whether the cast-vs-carved pair are forks or sequential
checkpoints is determined at consolidation.

**Superseded checkpoints:** twin A's earlier checkpoint
(hancock/checkpoint-20260830-6a942e20.html, share 6a942e20…, md5
3c79f4ce6cd3d7b7143a1ee8095994d9) was removed from the working tree on
2026-09-01 after mechanical verification that the 2026-09-01 checkpoint
of the same conversation is a strict superset: all 307 long-form
messages matched exactly, 48,267 of 48,270 short strings matched (the
3 misses are share-page chrome — the generic OG placeholder image, its
alt text, and the old link's own /continue URL), and every
non-ephemeral embedded URL is contained. The old file remains preserved
in git history (commit d33e620, PR #121).
