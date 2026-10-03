# The experiment's runs

Each directory here is one run of the check verb, as the verb wrote it: its
run record and each seat's raw reply, with a repaired reply where the verb
asked a seat again. They are kept here and not under `proposals/<runId>/`
because that is where the scheduler and the site's pages read a case's
sittings, and these are an experiment's: nothing they produced is
installed in any case. The gate's run account reads a run record wherever
it is filed.

A run record's `wrote:` lines name the assessment files the verb installed
in the experiment's working tree. Those files were analysed and removed;
they are not in the repository, and no case's record or standing is
changed by them. The raw replies here hold everything the seats said; they
do not hold the stamps the verb adds on installing (a run id with the
time, the run that produced it, the model label, the date, the protocol
version and the ledger's hash). The run record carries the hash of the
case file every seat was sent (`inputHash`), which is how `analyse.mts`
tells whether a run judged the ledger the tree holds.

The arm-B runs are stamped `check-v4`: the draft beside the design,
`../check-v4-draft.md`, was copied to `protocols/check-v4.md` for each of
those runs and removed after it. Whether that name now belongs to an
adopted protocol or is spent is in `../REPORT.md`.

The spend rows for these runs are in `governance/spend/`, as for any run:
the money was spent.
