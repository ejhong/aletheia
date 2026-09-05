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
| hancock/checkpoint-20260905-6a9c1771.html | Hancock dossier (forked twin A, passes 1–186; later checkpoint) | chatgpt.com/share/6a9c1771-bf6c-83e9-b876-2c56470dd380 | 2026-09-05 | b152dce14583355abc185e9780cc8611 |
| hancock/checkpoint-20260905-6a9c1697.html | Hancock dossier (continuation chat, passes 187–192, 2026-09-03/04) | chatgpt.com/share/6a9c1697-7870-83ea-94a3-0981c2cd4c82 | 2026-09-05 | ac8db24afe94614fbcda9ec72acc79cc |
| hancock/checkpoint-20260830-6a93a3ce.html | Hancock dossier (forked twin B) | chatgpt.com/share/6a93a3ce-cb08-83e9-b170-36ba77d56ade | 2026-08-30 | 689a7f7ca8b628ff9656f173c020f820 |
| cast-vs-carved/checkpoint-20260905-6a9c1664.html | Cast-vs-carved (A, rounds 1–194; later checkpoint) | chatgpt.com/share/6a9c1664-08e0-83e9-82b4-3d655001e48a | 2026-09-05 | f2c636192b0a8f506a8936b1d2d1e69c |
| cast-vs-carved/checkpoint-20260905-6a9c161a.html | Cast-vs-carved (B, rounds 1–193; later checkpoint) | chatgpt.com/share/6a9c161a-5258-83e9-b346-c0515e9f0e38 | 2026-09-05 | aa780a285bb78f46f030f878f3e32d86 |

The Hancock twin-A and twin-B captures are simultaneously-running forks
of one project (to be merged at consolidation, with divergences preserved
as divergences). The 6a9c1697 file is a separate, short continuation chat
(6 hourly passes, numbered 187–192, 2026-09-03/04) run under the same
hourly prompt as twin A; it shares almost no text with twin B despite
carrying the same auto-title "Hancock Dossier Pass", so it is archived as
its own checkpoint rather than as a supersession of either twin. The two
cast-vs-carved captures are parallel runs of two differently-worded hourly
prompts over the same dossier (A: "cast, not carved"; B: "Cast, Not
Carved?"), both still at 0/2 consecutive non-material rounds at capture.

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

**Superseded checkpoints (2026-09-05):** three earlier files were
removed from the working tree after mechanical verification that the
2026-09-05 checkpoint of the same conversation is a strict superset. The
check decodes each share page's embedded turbo-stream, collects every
string, and compares: all long-form strings (≥200 chars) of the earlier
file are present verbatim in the later one; the only absent short strings
are turbo-stream index keys and the share page's own OG image/alt text;
the only absent URLs are the old link's own OG image/`/continue` chrome.

| Removed file | Superseded by | Long strings (old ⊂ new) | Non-chrome URLs missing |
|---|---|---|---|
| hancock/checkpoint-20260901-6a962cd8.html (md5 84b967a844bd4df94cd21ead7ea8e1db) | 6a9c1771 (passes 1–186; old ended at pass 117, 2026-09-01) | 20,315 ⊂ 31,090 | 0 |
| cast-vs-carved/checkpoint-20260830-6a942eec.html (md5 16a6f119e3f3cf24a274918e1a194477) | 6a9c1664 (rounds 1–194; old ended at round 50, 2026-08-30) | 11,006 ⊂ 21,555 | 0 |
| cast-vs-carved/checkpoint-20260830-6a942f07.html (md5 16ae05ed9f5c6ca5945cf13d09b93af0) | 6a9c161a (rounds 1–193; old ended at round 94, 2026-08-30) | 7,608 ⊂ 17,700 | 0 |

All three remain in git history (commits d33e620 / PR #121 and 5fcba62
/ PR #123).
