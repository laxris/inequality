# Simulation contract — model versions 1 and 2

This directory is a deterministic, UI-independent economic engine. These rules
extract the mathematical requirements from the root AGENTS.md and specify the
supported models' choices. They are requirements for changes, not claims of economic
realism. Never describe an economic or PRNG change as a behavior-preserving refactor.

## Refactoring gate

Run `npm test`, `npm run typecheck`, and `npm run build` from the repository root.
Keep property tests and the committed seeded trajectory fixtures passing. Invariants
alone cannot protect exact outcomes: a different pairing algorithm can conserve
wealth while changing every trajectory. Preserve PRNG algorithm, draw count and
order, iteration order, arithmetic order, and tie-breaking during refactors.
Do not regenerate fixtures to hide a failure. Intentional model changes require
an explicit explanation, a model version decision, and reviewed fixture changes.
Simulation modules must not import React or depend on browser state, wall-clock
time, rendering, animation, or global randomness.

## State and reproducibility

- Exactly 100 participants, IDs 0–99 in that order. Identity and population persist.
- Initial wealth is equal: w_i = initialWealth; W = 100 × initialWealth.
- Every w_i is finite and nonnegative; total wealth and ledger fields are finite.
- Transitions must not mutate their input state or configuration, including on error.
- Same initial state, configuration, seed and N gives the same complete state:
  participant values, ledger, metrics, round and PRNG state.
- Reset restores initial wealth, round zero and the seed's PRNG state.
- step repeated N times = runRounds(N) = any partition of N into playback batches.
- One step increments the round exactly once. Zero rounds is identity.
- Model v1 uses Mulberry32 with unsigned 32-bit seed and explicitly carried state.
  Even zero seed is valid. Simulation code must never call Math.random().

## Versioned common random numbers

Version 1 remains the sequential Mulberry32 model. Existing v1 configurations,
shared URLs and exact fixtures must reproduce their original results. Taxes already
consume no draws in v1: changing only a tax rate does not desynchronize that stream.
The main coupling improvement in v2 is isolation from unrelated mechanisms and
changes in their draw counts. Neither version guarantees the same selected person
when wealth-dependent weights differ.

Version 2 uses Philox4x32-10 with stateless coordinates:

    U = keyedUniform(seed, channel, startingRound, event, processOccurrence)
    U in [0, 1)

The first transition uses startingRound = 0. Key = [seed, 0]. Counter words are
[event, low32(round), high32(round), channelNumber + 256 × processOccurrence].
Use the first output word divided by 2^32. Channel assignments are frozen:
transfer.pairing=1, transfer.coin=2, shock.outcome=3, opportunity.selection=4,
opportunity.return=5, investment.return=6. Pairing uses the descending shuffle
index; coin uses the pair index; participant returns use the participant index;
opportunities use the event index. All are zero-based where applicable.

Process occurrence counts instances of the SAME process type, starting at zero.
Adding an unrelated process must not renumber these keys. Multiple instances of
the same type remain positional: reordering them changes their correspondence.
Selection and payoff use different channels. Increasing opportunity counts cannot
shift universal-return draws. Wealth-dependent selection can map a shared uniform
to a different person; that is an economic consequence, not stream drift.

V2 state carries modelVersion=2 and randomState=seed (no advancing stream cursor).
Never step a v1 state using v2 rules or vice versa. Reset explicitly when changing
models. Batch experiments explicitly convert configuration copies to v2; they do
not convert or mutate existing scenario states. Matching keys couple random inputs,
not recipients, wealth values, or event outcomes after probability changes.

Both models must satisfy the economic invariants below. Preserve v1 fixtures;
maintain separate v2 fixtures and official Philox known-answer tests. A refactor
must preserve channel IDs, counter encoding, event indices and occurrence numbering.

## Paired experiment contract

The React-independent runner in ../experiments/runner.ts starts both branches
from the same equal initial wealth and paired unsigned 32-bit seed. It never
advances live scenario states. Seed ranges do not wrap. Changing checkpoints or
seed execution order must not change a seed's trajectory.

    delta(seed, round, metric) = treatment - control
    summary = quantiles of these paired differences

The median of differences need not equal the difference of medians. Report sample
10th–90th percentiles with R7 linear interpolation, not confidence intervals for
an expected effect. Wealth-share differences use percentage points. P(Gini lower)
is the fraction with strictly negative delta; exact ties and higher values are
reported separately. It is an empirical result under this model and seed set.

Cumulative tax revenue and redistribution sum actual ledger collections/payments
through each checkpoint, including the checkpoint round. All reported values must
be finite. Any failed seed aborts the experiment; do not omit it or turn a cancelled
partial seed set into a completed estimate. Retain request provenance with results.
Identical configurations must yield exactly zero paired differences at every
checkpoint. Charting and worker scheduling cannot affect simulation outcomes.

## Round order

1. Transfers in configuration order.
2. External processes in configuration order; opportunity events are sequential.
3. Taxes in configuration order, using current post-process wealth.
4. Retain current tax revenue in Treasury, or redistribute it once.
5. Calculate metrics; increment round.

Changing this order changes the model. No policy or economic outcome depends on
playback speed. Invalid configuration/state must throw without committing a partial
round. A simulation that overflows stops; do not silently clamp large wealth.

## Transfers

Fisher–Yates shuffle; consecutive pairs; one fair payer-selection draw per pair.
Each participant pairs once per transfer process per round. All participants remain
eligible, including zero-wealth participants. No debt:

    amount = min(stake, payer wealth)
    payer change = -amount; recipient change = +amount
    sum(transferGains) = sum(transferLosses) = totalTransfers
    W_after_transfers ≈ W_before_transfers

The stake is capped only by the chosen payer's funds, not both participants' funds.
A zero stake leaves wealth unchanged but still consumes pairing and coin draws.

## External processes

Independent shocks: each participant gets its own fair ±amount draw. Actual loss
is capped by available wealth. Total wealth is NOT conserved. Away from the floor,
expected change is zero; at the floor, clipping creates positive expected drift.
Do not call this economically equivalent to pairwise exchange.

Opportunity selection, recalculated before every event, with replacement:

    q_i = (w_i + baselineOpportunityAccess)^opportunityAccessExponent
    P(i) = q_i / sum(q)

Use normalized weights to avoid overflow. Exponent zero gives equal access even
when wealth and baseline are zero. All-zero weights fall back to uniform selection.
Positive baseline gives positive access to zero-wealth participants in ordinary
numerical ranges. Zero baseline and positive exponent intentionally exclude zero
wealth unless all weights are zero. Selection and return use separate draws.

Access and payoff are independently configured:

    proportional capital = wealth × investmentFraction
    fixed capital = min(fixedCapital, wealth)
    delta = capital × returnRate
    E[returnRate] = p × successReturn + (1-p) × failureReturn

Capital is not spent or subtracted as principal. Only the return creates/destroys
wealth. Fixed capital is limited by available wealth; baseline access does not
provide funding. Fractions are in [0,1], failure returns in [-1,0]; no debt occurs.
Universal multiplicative returns apply independent returns to all participants:

    w_i' = w_i × (1 + investmentFraction × returnRate_i)

    W_after_external - W_before_external
      ≈ externalWealthCreated - externalWealthDestroyed

## Tax and redistribution

Income tax uses explicitly selected gross positive ledger flows: external gains,
transfer gains, or both. Transfer-only taxation excludes all external gains. It is not a tax on wealth or net change.
Losses are not deducted; collection is capped at available wealth to avoid debt.
Multiple income taxes use their selected gross flow bases, collected in configured order.
The transfer-only option extends model v1; existing configurations and their exact
trajectory fixtures remain unchanged.

    income tax = min(current wealth, rate × selected gross gains)
    wealth tax = rate × max(0, current wealth - exemption)

Wealth tax is assessed after preceding taxes. Rates are per round, not annual.
Zero-rate policies cause no economic change and consume no randomness.

Universal redistribution pays everyone equally. Bottom-fraction redistribution
ranks AFTER all taxes, before any payout, by (wealth ascending, ID ascending),
selects ceil(100 × fraction), then pays those participants equally. Ignore binary
rounding within Number.EPSILON × population of a whole-person boundary, so 7%
selects seven people rather than eight. Fraction must
be in [0.01,1]; a zero-recipient policy is rejected. Never reorder primary state.

Without retention, taxesCollected ≈ redistributionPaid and private wealth is
conserved by policies. Optional redistribution.type="retain" sends current taxes
to Treasury instead, with no participant payout:

    T_initial = 0
    T' - T ≈ taxesCollected - redistributionPaid
    (W' + T')_policies ≈ (W + T)_before_policies

Treasury is not a participant. It earns no return, receives no opportunities, and
is excluded from Gini, wealth shares and circle area. Redistribution modes pay only
current-round collections, never old reserves implicitly. A configuration reset
starts Treasury at zero. There is no deficit, spending, cost or external financing.
Reject negative/nonfinite reserves and overflow of private wealth + Treasury.

### Optional tax relief (hypothetical loophole)

This is a backward-compatible extension to both v1 and v2: absent options preserve
existing states and exact fixtures. No random draws are added. Optional Treasury
and relief-ledger fields are omitted for original configurations. Reporting adds
fiscal metrics separately, leaving original distribution metric fixtures intact.

Tax relief configuration defines eligibility (wealthiest or fixed), fraction,
discount in [0,1], and affected income/wealth/both taxes. Select ceil(100 × fraction)
with the same whole-person boundary tolerance as redistribution. Wealthiest sorts
a COPY by descending post-process/pre-tax wealth, then ascending ID. Freeze this
membership for ALL taxes in the round, and recalculate next round. Fixed privilege
always selects the lowest IDs (UI participant 1 = internal ID 0), regardless of
wealth. At equality, lower IDs receive an arbitrary initial advantage.

For each tax, with current wealth w, assessed base b and statutory rate r:

    liability = b × r
    d = configured discount for eligible people on affected taxes, else 0
    collectibleBeforeRelief = min(w, liability)
    actualTax = min(w, liability × (1 - d))
    collectionForgone = collectibleBeforeRelief - actualTax >= 0

The discount applies BEFORE the funds cap. A liability discount can therefore
produce zero actual collection forgone if both liabilities still exceed funds.
The ledger records eligibility (0/1), collectible amounts, actual payments, forgone
collections and selected-tax assessed bases/payments per participant. The round
aggregates collectible amounts and relief. Relief is explanatory accounting, not
another wealth flow: do not add it again in participant reconciliation.

    collectibleBeforeRelief ≈ actualTax + collectionForgone

These are local comparisons using the SAME wealth/base immediately before each tax,
not a separate trajectory without relief. Earlier relief can change later tax bases;
foregone collections are not the full counterfactual cumulative revenue effect.
Zero discount preserves participant wealth and random trajectories exactly (additional
ledger metadata is allowed). Full discount eliminates selected taxes for eligible
participants. Holding state/base fixed, relief cannot increase their collection.

Group effective rates = selected-tax payments / selected assessed bases, with no
rate when the denominator is zero. Normalize the denominator to avoid overflow.
Selecting both tax types combines income-flow and wealth-stock bases; comparisons
must use the same base selection. Top-5% wealth share is measured after the round
and need not describe the eligible pre-tax group. Batch cumulative relief sums
actual forgone collections through the checkpoint; it is not created wealth.

## Ledger reconciliation

For EVERY participant, EVERY round:

    w_i' - w_i ≈ transferGains - transferLosses
                  + externalGains - externalLosses
                  - taxesPaid + transfersReceived

All gain/loss/tax/payment fields are nonnegative. Aggregate fields equal the sums
of their participant fields; transfer volume counts each payment only once.
For the complete round:

    (W' + T') - (W + T) ≈ externalWealthCreated - externalWealthDestroyed

Retain the latest ledger and lightweight aggregate history in the UI. Do not invent
inspection values that cannot be derived from the state and ledger.

## Metrics and visual contracts

Let n be population, W = sum(w), and x be wealth sorted ascending on a COPY.

    mean = W/n
    median = middle value, or mean of the two middle values
    Gini = sum((2i + 1 - n) × x_i / W) / n, i = 0..n-1

For nonnegative wealth, 0 ≤ Gini ≤ (n-1)/n. Equality gives zero; a single owner gives
(n-1)/n. Gini is unchanged by positive scaling or permutation. For W=0, define
Gini and every wealth share as zero (a documented convention, not division by zero).
Top shares use ceil(n × fraction) richest; bottom shares use ceil(n × fraction)
poorest. With 100 participants: top 1 = 1, top 10 = 10, bottom 50 = 50 people.
Metric sorting must not mutate participants. Reject negative/nonfinite input.

The primary view keeps positions fixed by ID. Circle AREA is proportional to wealth
share: r = k × sqrt(w_i/W). Zero wealth gives zero area; a separate hit target or
marker may remain. Do not cap radii to a cell. Color describes round change, with
numeric text available. Animation is presentation only.

## Required evidence

- Known analytical examples: equality, single-owner Gini, all-zero population,
  deployed-capital gains/losses, tax exemptions, gross income, and percentile ties.
- Property tests over valid distributions, stakes, rates, fractions, seeds and
  round counts: conservation, reconciliation, no debt, finite state, identity,
  input immutability and reproducibility.
- Committed exact seeded trajectories for every preset, including PRNG state.
- Playback partition equivalence and focused UI Step/Reset/Run/Pause checks.
- Invalid configuration rejection, including NaN/Infinity, bad unions, out-of-range
  probabilities, fractions, seed and event counts.

Use JavaScript numbers. Accounting comparisons should use a scale-aware tolerance
(e.g. 1e-9 × max(1, |expected|, |actual|)); exact comparisons apply to identities,
rounds, PRNG states and committed trajectory regression fixtures. Do not round
wealth to cents inside the engine. Statistical expectations do not imply that a
single run must equal its expected value or that inequality increases every round.


## Mobility analysis contract

Mobility compares the same 100 unique IDs across two nonnegative finite wealth
snapshots, without changing either snapshot or consuming random draws. Sort copies.
Spearman correlation is Pearson correlation of ascending wealth midranks (0–99):
all members of a wealth tie receive their average rank. Return null, not zero, if
either rank variance is zero. Percentile rank is midrank / 99; mean absolute rank
movement averages absolute endpoint differences over 100 people.

Quintiles sort by (wealth ascending, ID ascending), exactly 20 people per group.
Transition cell (i,j) = count(reference quintile i, current quintile j) / 20.
Rows and columns sum to one. Bottom escape = 1 − cell(0,0); top persistence =
cell(4,4). ID tie-breaking is arbitrary at an equal start and must be disclosed.
Neither statistic measures intermediate transitions or whether someone ever escaped.

Identity, positive affine wealth transformations and input array permutation must
preserve these metrics. Identical untied ranks give correlation 1 and movement 0;
reversed untied ranks give correlation −1. Equal endpoints have undefined correlation.
Capturing a UI reference pauses playback and copies only participants and round;
it must leave engine state, seed and history unchanged. Reset/clone start at round
zero. Reference capture is analysis, not a fork or a policy intervention.

## Workspace continuation contract

JSON restoration preserves participant identities, round, PRNG state/model, fiscal
state and applied configuration. Advancing a restored state by N rounds must equal
advancing the original state by N rounds exactly, in both randomness versions.
Import validates finite state, derived metrics and ledger aggregates before replacing
any workspace. It is not proof of historical provenance and does not replay old rounds.
Playback batching and pruning old aggregate history must not change engine state or
future draws. Imports always pause playback and invalidate previously queued ticks.
