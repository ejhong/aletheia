# The follow-up's runs

Each directory here is one run of the check verb, as the verb wrote it: its
run record and each seat's raw reply, with a repaired reply and the problems
that sent it back where the verb asked a seat again. They are kept here and
not under `proposals/<runId>/`, where the scheduler and the site's pages
read a case's sittings: nothing they produced is installed in any case. The
gate's run account reads a run record wherever it is filed.

A run record's `wrote:` lines name the assessment files the verb installed
in the experiment's working tree. Those files were analysed and removed;
they are not in the repository. The raw replies hold everything the seats
said; they do not hold the stamps the verb adds on installing. Each run
record carries the hash of the case file its seats were sent (`inputHash`).

The runs are stamped `check-v5` and `check-v6`: the drafts beside the
design were copied to `protocols/check-v5.md` and `protocols/check-v6.md`
for each run and removed after it. Neither was adopted, and both names are
spent (`../REPORT.md`).

The control for these runs is the eight `check-v2` runs in
`../../2026-09-30-a-rule-for-claims-with-no-evidence/runs/`. The spend rows
are in `governance/spend/`.
