# The experiment's runs

Each directory here is one run of the check verb, as the verb wrote it: its
run record and each seat's raw reply. They are kept here and not under
`proposals/<runId>/` because that is where the scheduler and the site's
pages read a case's sittings, and these are an experiment's: nothing they
produced is installed in the case. The gate's run account reads a run
record wherever it is filed (since #430).

A run record's `wrote:` lines name the assessment files the verb installed
in the experiment's working tree. Those files were analysed and removed;
they are not in the repository, and Deep Memory's record and standing are
what they were.

What the removed files held, and what is kept. Each was its seat's raw
reply, parsed, with the verb's own stamps: a run id carrying the time, the
run that produced it, the model label, the date, the protocol version, and
the ledger's hash. The raw replies here hold everything the seats said.
They do not hold those stamps. An earlier version of this note said the raw
replies "hold everything those files held"; that was wrong (review note
#428). The ledger's hash, and the evidence that these runs judged it, are in
`../REPORT.md`.

A raw reply opens with a `runId` the seat wrote itself, as the protocol
asks: the date, the word `check` and the seat's tag. It is the same in each
of a seat's runs on one day. A reply is identified by its directory, which
is the run's id, and its file name, which is the seat.

The three runs of the second arm are stamped `check-v3`. That is the draft
beside the design, `../check-v3-draft.md`, copied to `protocols/check-v3.md`
for each of those runs and removed after it. It was never a protocol of the
site; `check-v2` is. The name is spent: the next version of the check
protocol is `check-v4` (a test holds that).

The spend rows for these runs are in `governance/spend/`, as for any run:
the money was spent.
