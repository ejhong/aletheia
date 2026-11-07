---
runId: 2026-11-07-session-site-140942
title: "Before Sputnik: the Hambly & Blair source now points at the arXiv full text it was quoted from, answering the second hold on #475"
cases: [transients]
---

# Answering the quote-check holds on #475

This session answers the two rounds in which the quote check held #475. No reviewer has read the change yet. I changed one source record and nothing else.

## Answer to the review

### Round 1 (commit 718fd2e): TRN-E233, TRN-E234, TRN-E240

The previous session (2026-11-06-session-site-151011, commit 7391f45) fixed all three by copying each passage again, exactly, from the text the check reads. Round 2 ran on that commit and did not list any of them. This session's fresh check (`check-quotes --base ed56707 --fresh`) passes all three too. Nothing more was needed.

### Round 2 (commit 7391f45): TRN-E228 (two passages), TRN-E231 (two passages)

**Fixed in the records: the source now points at the text the passages were quoted from.**

The review's machine read SRC-HAMBLY-BLAIR-2024 through its DOI. OpenAlex sent it to an open-access copy at `https://doi.org/10.48550/arxiv.2402.00497`, the arXiv DOI. That address serves the arXiv abstract page: 5,016 characters, with no body text. When this session read the same DOI, OpenAlex returned a different copy, the arXiv PDF (`https://arxiv.org/pdf/2402.00497`, 40,708 characters, 8 pages). Which copy you get depends on which one OpenAlex returns, so a DOI address is not a stable place to check quotations against.

All four passages are in the arXiv PDF, word for word apart from line-break hyphenation:
- "We found more than 100 detections on E0086 in the overlap region with brightness, eccentricity and area similar to the 9 detections on E0070": p. 4, §2.
- "there are many hundreds of similar images on both plates in the overlap region between the two fields": p. 6, §4, finding (d).
- "there is a large literature on the appearance of spurious microdots" and "no such artefacts have been reported as occurring on the older coarse–grained varieties": p. 5, §3.

The change to `content/cases/transients/sources.yaml`, SRC-HAMBLY-BLAIR-2024:
- `url` is now `https://arxiv.org/pdf/2402.00497`, the text the evidence quotes. The record's verification note already said the full text was read there. The journal DOI (10.1093/rasti/rzae004) stays in `identifier`.
- `archivedUrl` is now `https://web.archive.org/web/20260611122129/https://arxiv.org/pdf/2402.00497`, a Wayback capture of that same address. The check reads it if arXiv cannot be reached.
- One sentence added to the verification note says why the address is the arXiv PDF.

Four older records also cite this source (TRN-E002 to TRN-E005). They paraphrase it and quote nothing, so the change of address does not affect them.

## Checks

- `node scripts/site.ts check-quotes --base ed56707 --fresh`: 16 records, 38 passages, 0 failures. Run against the branch's base because fetching `origin/main` was refused. Without `--base`, the check lists eight records in the `ydih` case (YDIH-E004 and others) that quote no passage. They are not part of this change.
- `npm test`: 32 files, 283 tests passed.
- `node scripts/site.ts status`: every case loads.

## For the next session

Other sources whose `url` is a DOI and whose full text came from an arXiv copy could fail the same way, depending on which copy OpenAlex returns. When the evidence quotes the body of a paper, the source's address should be the full text the quotes came from. The reading tool could also be changed to prefer a copy's PDF over the arXiv DOI landing page, but that is engine work for its own session.
