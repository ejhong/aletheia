#!/usr/bin/env python3
"""
ORCH-S002 primary analysis, published under the study's frozen method
("All code, extracted table, and search log are published").

Input is the four extracted isotope arms of Li et al. 2018
(Anesthesiology 129:271-277, doi 10.1097/ALN.0000000000002226), taken from
the publisher-deposited JATS abstract via Crossref, which preserves the
isotope superscripts that the PubMed rendering strips.

Every model, diagnostic and threshold below was fixed in the freeze
(criteria hash 4fa792b878fa) before any number was read.

Run: python3 orch-s002-analysis.py
"""

import itertools

import numpy as np
from scipy import stats

# ---------------------------------------------------------------- data ----
# mass number, nuclear spin I, ED50 xenon-alone (% atm, author-calculated),
# ED50 measured with 0.50% isoflurane (% atm), reported dispersion (+/-).
ARMS = [
    # isotope, mass, I, ed50_alone, disp_alone, ed50_withiso, disp_withiso
    ("132Xe", 132, 0.0, 70.0, 4.0, 15.0, 4.0),
    ("134Xe", 134, 0.0, 72.0, 5.0, 16.0, 5.0),
    ("131Xe", 131, 1.5, 99.0, 5.0, 22.0, 5.0),
    ("129Xe", 129, 0.5, 105.0, 7.0, 23.0, 7.0),
]
N_PER_ARM = 20  # 80 C57BL/6 male mice, 7 weeks old, four groups

name = np.array([a[0] for a in ARMS])
mass = np.array([a[1] for a in ARMS], dtype=float)
spinI = np.array([a[2] for a in ARMS], dtype=float)
spin = (spinI > 0).astype(float)
y_alone = np.array([a[3] for a in ARMS], dtype=float)
s_alone = np.array([a[4] for a in ARMS], dtype=float)
y_iso = np.array([a[5] for a in ARMS], dtype=float)
s_iso = np.array([a[6] for a in ARMS], dtype=float)


def wls(X, y, sd):
    """Weighted least squares, weights = inverse variance.

    With equal n per arm the relative weights are identical whether the
    reported +/- is an SD or an SEM (SEM^2 = SD^2/n), so the coefficients
    below do not depend on which the paper meant; only the standard-error
    scale does. Reported here on the SD-as-published reading.
    """
    w = 1.0 / sd**2
    W = np.diag(w)
    XtW = X.T @ W
    beta = np.linalg.solve(XtW @ X, XtW @ y)
    resid = y - X @ beta
    dof = len(y) - X.shape[1]
    if dof > 0:
        s2 = (resid @ W @ resid) / dof
        cov = s2 * np.linalg.inv(XtW @ X)
        se = np.sqrt(np.diag(cov))
        t = beta / se
        p = 2 * stats.t.sf(np.abs(t), dof)
    else:
        se = t = p = np.full(len(beta), np.nan)
    return beta, se, t, p, dof


def design(cols):
    return np.column_stack([np.ones(len(mass))] + cols)


def show(label, X, y, sd, names):
    beta, se, t, p, dof = wls(X, y, sd)
    print(f"\n  {label}  (residual df = {dof})")
    for n_, b_, se_, t_, p_ in zip(names, beta, se, t, p):
        print(f"    {n_:<12} coef {b_:10.4f}   se {se_:9.4f}   t {t_:8.3f}   p {p_:8.4f}")
    return beta


print("=" * 78)
print("ORCH-S002 — xenon isotope potency on nuclear spin and atomic mass")
print("=" * 78)
print("\nExtracted arms (ED50 in % atm):")
print(f"  {'isotope':<9}{'mass':>6}{'I':>6}{'spin':>6}{'alone':>9}{'+/-':>6}{'with iso':>10}{'+/-':>6}")
for i in range(4):
    print(
        f"  {name[i]:<9}{mass[i]:6.0f}{spinI[i]:6.1f}{spin[i]:6.0f}"
        f"{y_alone[i]:9.1f}{s_alone[i]:6.1f}{y_iso[i]:10.1f}{s_iso[i]:6.1f}"
    )

# ------------------------------------------------ collinearity diagnostics ----
print("\n" + "-" * 78)
print("PRE-COMMITTED IDENTIFICATION DIAGNOSTICS (thresholds fixed at freeze)")
print("-" * 78)

r = np.corrcoef(spin, mass)[0, 1]
vif = 1.0 / (1.0 - r**2)
print(f"\n  corr(spin_present, mass)      = {r: .4f}")
print(f"  VIF (both predictors)         = {vif: .4f}    [freeze threshold: > 5 = FAILED]")

Xraw = design([spin, mass])
cond_raw = np.linalg.cond(Xraw)
Xs = Xraw / np.linalg.norm(Xraw, axis=0)
cond_scaled = np.linalg.cond(Xs)
print(f"  condition number, raw matrix  = {cond_raw: .1f}")
print(f"  condition number, unit-scaled = {cond_scaled: .4f}    [freeze threshold: > 30 = FAILED]")
print("\n  NOTE: the freeze set a threshold of 30 without naming a scaling")
print("  convention. Both are reported. The unit-column-norm (Belsley)")
print("  convention is used for the decision because the raw number is")
print("  dominated by the intercept-versus-mass scale difference alone and")
print("  would condemn any regression containing a ~131-valued covariate.")

Xc = design([spin, mass - mass.mean()])
Xcs = Xc / np.linalg.norm(Xc, axis=0)
print(f"  condition number, centred+scaled = {np.linalg.cond(Xcs): .4f}   (reported, NOT used)")
print(f"  mass range / mass mean        = {(mass.max()-mass.min())/mass.mean(): .4f}")
print("\n  The uncentred convention is the one applied, and it is the STRICTER")
print("  of the two: it is the reading that forces the refusal below. The")
print("  ill-conditioning it detects is real but is NOT spin-versus-mass — it")
print("  is intercept-versus-mass, because mass varies over 5 units around")
print("  131.5, under 4% relative range, so the mass column is nearly parallel")
print("  to the intercept. That is why the mass coefficient is unstable.")

failed = (vif > 5) or (cond_scaled > 30)
print(f"\n  IDENTIFICATION DECLARED {'FAILED' if failed else 'NOT FAILED'} by the frozen rule")
print(f"  (VIF {vif:.2f} passes; scaled condition number {cond_scaled:.1f} exceeds 30).")
print("  Per the freeze, NO SPIN p-VALUE BELOW IS REPORTED AS EVIDENTIAL.")

# ------------------------------------------------------- primary models ----
print("\n" + "-" * 78)
print("PRIMARY: WLS of xenon-alone ED50 on spin and mass, run three ways")
print("-" * 78)
show("spin only", design([spin]), y_alone, s_alone, ["intercept", "spin"])
show("mass only", design([mass]), y_alone, s_alone, ["intercept", "mass"])
show("both", design([spin, mass]), y_alone, s_alone, ["intercept", "spin", "mass"])

print("\n" + "-" * 78)
print("SENSITIVITY: same three models on the DIRECTLY MEASURED endpoint")
print("(ED50 with 0.50% isoflurane; the xenon-alone values are calculated)")
print("-" * 78)
show("spin only", design([spin]), y_iso, s_iso, ["intercept", "spin"])
show("mass only", design([mass]), y_iso, s_iso, ["intercept", "mass"])
show("both", design([spin, mass]), y_iso, s_iso, ["intercept", "spin", "mass"])

print("\n" + "-" * 78)
print("SENSITIVITY: spin quantum number I (0, 1/2, 3/2) replacing the binary")
print("-" * 78)
show("I only", design([spinI]), y_alone, s_alone, ["intercept", "I"])
show("I + mass", design([spinI, mass]), y_alone, s_alone, ["intercept", "I", "mass"])

# ------------------------------------------- within-class mass structure ----
print("\n" + "-" * 78)
print("WHAT MAKES THE TWO HYPOTHESES SEPARABLE AT ALL: within-class slopes")
print("-" * 78)
sz = spin == 0
sb = spin == 1
slope_sz = (y_alone[sz][np.argmax(mass[sz])] - y_alone[sz][np.argmin(mass[sz])]) / (
    mass[sz].max() - mass[sz].min()
)
slope_sb = (y_alone[sb][np.argmax(mass[sb])] - y_alone[sb][np.argmin(mass[sb])]) / (
    mass[sb].max() - mass[sb].min()
)
step = y_alone[mass == 131][0] - y_alone[mass == 132][0]
print(f"\n  spin-zero pair   132 -> 134 : ED50 {y_alone[mass==132][0]:.0f} -> {y_alone[mass==134][0]:.0f}"
      f"   slope {slope_sz:+.2f} %atm per mass unit")
print(f"  spin-bearing pair 129 -> 131 : ED50 {y_alone[mass==129][0]:.0f} -> {y_alone[mass==131][0]:.0f}"
      f"   slope {slope_sb:+.2f} %atm per mass unit")
print(f"  across the spin boundary 131 -> 132 (ONE mass unit): ED50 {y_alone[mass==131][0]:.0f}"
      f" -> {y_alone[mass==132][0]:.0f}, a step of {step:+.0f} %atm")
print("\n  The two within-class slopes have OPPOSITE signs and are small; the")
print("  one-mass-unit step across the spin boundary is an order of magnitude")
print("  larger, and large relative to the reported dispersions (+/- 4 to 7).")
print("\n  HONESTY CHECK on the sign reversal: the 132 -> 134 rise is +2 %atm")
print("  against dispersions of 4 and 5, so the non-monotonicity is WELL")
print("  INSIDE noise and is NOT by itself evidence against a monotone mass")
print("  effect. What is not inside noise is the MAGNITUDE ASYMMETRY: <= 6")
print("  %atm across two mass units within a spin class, versus 29 %atm")
print("  across one mass unit at the class boundary.")

print("\n  Model comparison, spin-only versus mass-only (equal df, same data):")
for lbl, X in (("spin only", design([spin])), ("mass only", design([mass]))):
    b, *_ = wls(X, y_alone, s_alone)
    w = 1.0 / s_alone**2
    res = y_alone - X @ b
    wrss = float(res @ np.diag(w) @ res)
    ybar = float(np.sum(w * y_alone) / np.sum(w))
    wtss = float(np.sum(w * (y_alone - ybar) ** 2))
    print(f"    {lbl:<11} weighted RSS {wrss:9.4f}   weighted R^2 {1 - wrss/wtss:7.4f}")

# --------------------------------------------------- leave-one-out refits ----
print("\n" + "-" * 78)
print("LEAVE-ONE-ISOTOPE-OUT REFITS (frozen secondary analysis)")
print("-" * 78)
print("\n  With 4 arms, dropping one leaves 3 observations for 3 parameters:")
print("  the two-covariate model saturates (residual df = 0) and no standard")
print("  error exists. Coefficients only:")
for drop in range(4):
    keep = [i for i in range(4) if i != drop]
    X = np.column_stack([np.ones(3), spin[keep], mass[keep]])
    b = np.linalg.solve(X.T @ X, X.T @ y_alone[keep])
    print(f"    drop {name[drop]:<7} intercept {b[0]:10.2f}  spin {b[1]:8.2f}  mass {b[2]:8.3f}")

# ------------------------------------------------------------- rank check ----
rho, prho = stats.spearmanr(mass, y_alone)
print("\n" + "-" * 78)
print("RANK-ORDER CHECK (frozen secondary analysis)")
print("-" * 78)
print(f"\n  Spearman rho(mass, ED50_alone) = {rho:.4f}   p = {prho:.4f}   (n = 4)")
print("  Not monotone: 132 -> 134 rises while the overall trend falls.")

# ------------------------------------------------------ exhaustive check ----
print("\n" + "-" * 78)
print("CAN ANY MONOTONE FUNCTION OF MASS ALONE REPRODUCE THE ORDERING?")
print("-" * 78)
order = np.argsort(mass)
print("\n  ED50 by ascending mass: " + ", ".join(
    f"{name[i]}({mass[i]:.0f}) = {y_alone[i]:.0f}" for i in order))
mono_dec = all(y_alone[order][i] >= y_alone[order][i + 1] for i in range(3))
mono_inc = all(y_alone[order][i] <= y_alone[order][i + 1] for i in range(3))
print(f"  monotone decreasing in mass? {mono_dec}")
print(f"  monotone increasing in mass? {mono_inc}")
print("  => The POINT ESTIMATES are non-monotone in mass. But per the honesty")
print("     check above, the reversal is +2 %atm against dispersions of 4-5,")
print("     so this rules nothing out. It is reported as a descriptive fact")
print("     about the four published means, NOT as evidence against a mass")
print("     effect. The load-bearing observation remains the magnitude")
print("     asymmetry, not the sign reversal.")

print("\n" + "=" * 78)
print("PRE-COMMITTED EXPECTATION, SCORED")
print("=" * 78)
print("""
  The freeze recorded, in knownCandidates, this expectation:
    "spin and mass number will be strongly negatively collinear across the
     four arms; I expect a VIF above the pre-set threshold of 5 and a design
     matrix that cannot separate the two coefficients. If that expectation is
     wrong, the freeze records it as wrong."

  Scored: RIGHT ON THE VERDICT, WRONG ON THE MECHANISM AND ON ITS NUMBER.

  Right: identification does fail by the frozen rule, and no spin p-value is
  reported as evidential.

  Wrong on the number it named: the VIF is %.2f, BELOW the threshold of 5 it
  predicted it would exceed. Spin-versus-mass collinearity (r = %.3f) is real
  but not disabling, because the study happens to put two isotopes on each
  side of the spin boundary.

  Wrong on the mechanism: what actually fails the rule is the scaled
  condition number, %.1f against a threshold of 30, and its source is
  intercept-versus-mass, not spin-versus-mass. Mass spans 5 units around
  131.5 — under 4%% relative variation — so a linear mass term is barely
  distinguishable from the constant. The freeze anticipated the wrong
  collinearity.
""" % (vif, r, cond_scaled))
