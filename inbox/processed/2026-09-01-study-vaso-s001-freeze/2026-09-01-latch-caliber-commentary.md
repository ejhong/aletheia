---
case: vasocomputation
editor: Eugene
from: "an AI model, relayed by the founder (vendor and session not identified)"
provenance: "pasted into a Cursor cloud-agent session, 2026-09-01"
type: commentary
---

## Processing note — written by the agent, not by the contributor

This is a pre-freeze design review of the 2026-08-31 agenda proposal
"Latch-bridge evidence by vessel type and caliber"
(`proposals/agenda/2026-08-31-agenda-33432478115/vasocomputation.md`, item 2).
It was acted on in runId `2026-09-01-study-vaso-s001-freeze`, which adopted the
proposal as research item VASO-R007 and froze it as study VASO-S001.

What was taken from it, into the frozen criteria: the two independent grading
axes (latch evidence versus knot relevance); the broadening of the energetic
criterion from ATPase to any energetic or cycling readout; transmural pressure
and preparation type as extraction columns alongside temperature; stimulus
persistence and post-withdrawal behaviour as extraction columns; the vocabulary
variants under which the older literature is indexed; and the reframing of the
output from "every latch-bridge demonstration" to a preregistered evidence map
located through a frozen search strategy. Its recommendation to amend VASO-R004
into a paired-caliber, pressurized design with a stimulus-withdrawal phase was
also adopted.

What was NOT taken from it: its literature findings. Every paper it names was
independently resolved against Crossref before the freeze and entered as a
pre-committed known candidate with its identifier; one — a canine saphenous-vein
report said to infer latch formation from an approximately 11.9 per cent fall in
shortening velocity — could not be resolved and is recorded as an unlocated
lead. None of its characterisations of what those papers found has been
verified, and none has entered `claims.yaml`, `evidence.yaml`, or `sources.yaml`.
Its suggested rewordings of VASO-C010 and VASO-C020 were declined for the same
reason: the vessel-type-variation qualification it proposes for C010 is precisely
what VASO-S001 exists to establish, and rewriting a featured claim on the
strength of an unverified recollection, before the audit it motivated has run,
is the failure mode §3.12 exists to prevent.

The verbatim text follows.

---

My view

This is an excellent proposal and one of the highest-leverage desk investigations for the knot hypothesis. It isolates a hidden inferential step that could otherwise remain buried:

Latch behavior exists in some vascular smooth muscle
therefore latch behavior can sustain localized constriction in skeletal-muscle microvessels.

The second proposition does not automatically follow from the first. My preliminary literature check suggests that the gap you identified is real—and potentially more consequential than your current wording indicates.

What the literature appears to show so far

The canonical evidence comes from large arterial preparations, particularly carotid arterial media. Dillon and colleagues’ foundational 1981 study argued that myosin dephosphorylation could produce attached, noncycling “latch bridges” responsible for economical force maintenance. Later work measured force alongside oxygen-consumption-derived ATP expenditure in swine carotid medial rings and found that the economy of force maintenance varied strongly with myosin regulatory light-chain phosphorylation. These are important demonstrations, but they are not demonstrations in skeletal-muscle resistance microvessels.

Even more important, latch behavior may not be generic across vascular smooth muscle. Han and colleagues reported evidence for latch formation in rabbit femoral artery but an absence of it in the downstream muscular saphenous artery. A follow-up using pressurized vessels found that femoral—but not saphenous—arteries could temporarily resist pressure-induced dilation in the manner predicted from latch behavior. That means vessel type, motor-protein phenotype, and caliber cannot safely be treated as incidental variables.

There are examples outside large arteries, but they are not equivalent:

A canine saphenous-vein study inferred probable latch formation from an 11.9% decline in maximum shortening velocity during contraction; it did not directly demonstrate reduced energetic expenditure.
The frequently cited pulmonary-arteriole example is a mathematical model predicting latch-state maintenance, not a direct arteriole energetics experiment.
A 2022 purified-myosin study provided unusually direct molecular evidence that smooth-muscle myosin can maintain force during LC20 dephosphorylation, with stronger persistence in tonic than phasic smooth-muscle myosin. But it was deliberately vessel-agnostic and therefore cannot establish the presence of the mechanism in skeletal-muscle arterioles.

In my targeted preliminary search, I did not locate a primary study satisfying all of your strongest conditions:

skeletal-muscle arteriole or smaller microvessel + physiological temperature and pressure + maintained force or diameter + contemporaneous measurement of energetic cost or cross-bridge cycling.

That is not yet proof that no such paper exists. It is enough to say that the absence is plausible and that the systematic evidence map is justified.

The most important improvement: separate three different propositions

Your current proposal risks treating “latch demonstration” as one binary category. I would separate:

Latch-state phenotype: force or constriction remains high while activation, shortening velocity, or energetic expenditure falls.
Latch-bridge mechanism: force is specifically maintained by attached, dephosphorylated, slowly cycling or noncycling myosin bridges.
Knot relevance: the phenomenon occurs in the correct vascular bed, caliber, pressure regime, temperature, stimulus environment, and timescale.

A carotid-ring study may score highly on the first proposition, moderately on the second, and poorly on the third. A pulmonary-arteriole model may be highly relevant anatomically but weak as direct evidence. The 2022 molecular work is strong evidence for the bridge mechanism but supplies essentially no localization evidence.

I would therefore give each paper two independent grades:

Latch-evidence grade: direct energetic, biochemical-mechanical, functional inference, molecular reconstitution, or model only.
Knot-relevance grade: skeletal-muscle microvessel under physiological conditions; another resistance vessel; or large artery/vein/nonvascular preparation.

That two-axis structure will prevent the dossier from accidentally converting a strong but anatomically remote result into direct support for C020.

Add pressure and persistence, not merely temperature

Temperature is important, but physiological pressure may be at least as important. An isometric arterial ring at nominally zero transmural pressure is mechanically very different from a pressurized arteriole regulating lumen diameter against 40–100 mmHg. The Call study was valuable precisely because it moved from isometric strips into pressurized vessels.

The table should therefore capture:

Vascular anatomy: vascular bed, named vessel, branch order, actual luminal diameter at a stated pressure, wall thickness, smooth-muscle layers, and whether “precapillary sphincter” is an author-defined anatomical observation rather than an assumed category.

Preparation: ring, strip, cannulated pressurized vessel, isolated cells, intact tissue, in vivo preparation, endothelial status, temperature, pressure, flow, oxygenation, and imposed length or load.

Activation: KCl, electrical stimulation, adrenergic agonist, myogenic pressure, neural stimulation, local metabolite, hypoxia, or spontaneous tone.

Readouts: force or diameter; LC20 phosphorylation; intracellular calcium; shortening velocity; stiffness; ATP turnover; oxygen consumption; heat production; phosphocreatine or lactate; and whether measurements were simultaneous and time-resolved.

Persistence: duration of the plateau, whether the initiating stimulus remained present, behavior after stimulus withdrawal, relaxation kinetics, and reversibility.

That last group is essential for your knot hypothesis. Latch can explain economical maintenance without necessarily explaining memory. A microvessel might remain constricted cheaply only while upstream calcium sensitization, sympathetic input, myogenic pressure, Rho-kinase activity, inflammatory signaling, or another maintaining input remains active. The pressurized femoral study itself described latch as temporarily resisting dilation during transient pressure increases—not as creating an autonomous, indefinitely persistent vascular lesion.

So even a positive arteriole study would leave a second question:

What continually selects and maintains this particular microvascular segment in the constricted state?

That may ultimately be more central to the “computational” component of vasocomputation than the latch bridges themselves.

Broaden “ATPase” to “energetic readout”

I would not require literal ATPase measurement. Much of the canonical work estimates energy consumption from oxygen consumption, lactate production, heat, or other metabolic measurements. A narrow ATPase criterion could inadvertently exclude some of the strongest evidence. Wingard and colleagues, for example, partitioned energetic expenditure using oxygen consumption and lactate release in swine carotid smooth muscle.

Use:

force/diameter and energetic-or-cycling time course

Then separately record the assay: ATPase, ATP turnover, oxygen consumption, lactate, heat, phosphocreatine, shortening velocity, stiffness, or phosphorylation.

Do not promise “every latch-bridge demonstration”

The older literature does not always use the expression latch bridge. Relevant papers may instead be indexed under:

high economy of force maintenance;
tonic force maintenance;
reduced shortening velocity;
stress–phosphorylation dissociation;
slow cross-bridge cycling;
myosin dephosphorylation;
tonic versus phasic smooth muscle.

I would phrase the output as:

A preregistered evidence map of all eligible primary reports located through the frozen search strategy, citation chaining, and author/paper-family searches.

That is reproducible. “Every demonstration” is vulnerable to a single obscure paper overturning the completeness claim.

A stronger ready-to-use version
Vessel- and caliber-specific evidence for latch-state mechanics: is there direct evidence in skeletal-muscle resistance microvessels?

Question

Across primary experimental studies, in which vascular preparations has sustained force or constriction been demonstrated while cross-bridge cycling, myosin activation, or energetic expenditure declines? Does any study directly demonstrate this phenotype in a skeletal-muscle arteriole or smaller resistance microvessel under physiological temperature and pressure? Does the maintained constriction continue after withdrawal of the initiating stimulus?

Decisive record

Create a preregistered, versioned evidence map of all eligible primary studies. For every preparation, extract species, sex and age where reported; vascular bed; vessel and branch order; internal diameter at a defined pressure; wall thickness; preparation type; temperature; pressure and flow; endothelial status; stimulus; stimulus duration and withdrawal; force or diameter time course; intracellular calcium; LC20 phosphorylation; shortening velocity or stiffness; ATP turnover, oxygen consumption, heat, lactate, or other energetic readout; and relaxation or recovery time course.

Grade each record independently for:

strength of evidence for the latch-state phenotype;
strength of evidence for the latch-bridge molecular mechanism;
anatomical and physiological relevance to the proposed skeletal-muscle knot mechanism.

Models, reviews, and purified-protein experiments should be retained but placed in distinct evidence classes rather than counted as vessel-level demonstrations.

Interpretive result

Direct evidence in physiologically pressurized skeletal-muscle arterioles would remove the vessel-class availability gap underlying VASO-C020. It would not by itself establish that palpable or painful knots are vascular, that they persist autonomously, or that breathing and mechanical pressure release them.

Failure to locate direct evidence would formally classify C020 as a cross-vessel and cross-caliber extrapolation rather than a demonstrated mechanism. Evidence that some downstream muscular vessels lack latch behavior would strengthen the need to test the relevant microvascular preparation directly, while not proving that skeletal-muscle arterioles lack it.

Consequences for the existing claims

I would revise the dossier logic approximately as follows:

VASO-C010: Supported, but currently overbroad if it says latch operates generically in vascular smooth muscle. A safer formulation is:

Latch-state behavior has been demonstrated in particular vascular smooth-muscle preparations, especially carotid and other tonic arterial tissues, but its expression varies among vessel types.

VASO-C020: Keep it, but label it:

Mechanistically plausible extrapolation; direct demonstration in the relevant skeletal-muscle microvascular caliber has not yet been established.

VASO-R004: Make it a paired caliber experiment, not merely a positive/negative arteriole test. Study, where feasible, a feeding artery and successive arteriole orders from the same skeletal-muscle bed under pressurized physiological conditions. That would test whether latch capacity disappears, persists, or changes systematically as vessels become smaller. Include an explicit stimulus-withdrawal phase so the experiment distinguishes economical constriction under continuing activation from true state persistence.

Bottom line

I would green-light this proposal. It is unusually good because either result is informative:

A genuine direct microvascular demonstration materially strengthens the energetic feasibility of C020.
A literature concentrated in carotid, femoral, aortic, or other large tonic preparations exposes a major extrapolation.
A mixed result—especially positive large-artery evidence but negative downstream-vessel evidence—would be scientifically even more valuable because it would define a physiological boundary condition.

The proposal should not claim that it will settle the knot hypothesis itself. What it can settle very effectively is whether the hypothesized mechanism has ever actually been observed in the tissue compartment where the hypothesis needs it. That is exactly the right question to answer before investing heavily in R004.
