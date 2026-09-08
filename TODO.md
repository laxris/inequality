# Wealth Lab — roadmap and experiment ideas

## Current assessment

The core first version is substantially complete. The broader experimental
laboratory described in `AGENTS.md` still has planned extensions. Not everything
listed there is an immediate requirement.

Implemented:

- Deterministic, React-independent engine with separate transfers, external
  processes, taxes and redistribution.
- Fixed 100-participant grid, area proportional to wealth share, and participant
  inspection backed by the latest round ledger.
- Fixed-stake exchange, independent shocks, wealth-biased investment
  opportunities, and universal multiplicative returns.
- Income tax on external gains, transfer gains, or both; wealth tax with an
  exemption; universal and poorest-fraction redistribution.
- Seeds, Step/Run/Pause/Reset, playback speeds and configuration sharing by URL.
- Required aggregate metrics, inequality history and Lorenz curve.
- Named scenario tabs with independent runs, cloning/deletion, target-round
  playback, and comparison charts and tables.
- Mathematical contracts in `src/simulation/AGENTS.md`, property tests,
  analytical examples and exact seeded trajectory regression fixtures.

At the review preceding this roadmap, all 41 tests, type checking and the
production build passed. This records that review, not a permanent test result.

Remaining limitations:

- The engine accepts multiple processes and taxes, but the composer exposes one
  transfer process, one external process and one of each tax.
- No progressive tax brackets or configurable unequal starting distributions.
- No full participant replay, labor income, revenue calibration or saved
  collections of custom scenarios. Paired multi-seed effects are now available.

## Priority 1 — scenario tabs and comparison (implemented)

Implemented a workspace with one tab per scenario and a final **Comparison** tab.
Verification: 52 tests passed, including unchanged engine trajectory fixtures;
type checking and production build passed. Browser checks covered the acceptance
experiment, mobile layout, reduced motion, pausing inactive tabs and deletion.

### Scenario lifecycle

- [x] Create and name scenarios, starting from a preset or an existing scenario.
- [x] Give each scenario its own configuration, seed, participant state, PRNG
  state, round ledger, metric history and playback controls.
- [x] Preserve each scenario's state and history when switching tabs.
- [x] Advance a scenario only while its tab is selected and playback is running.
- [x] Pause the previous scenario when leaving its tab. Returning to a scenario
  should leave it paused until Run is pressed; selecting a tab is not a request
  to advance the simulation.
- [x] Selecting the final Comparison tab pauses all simulations. Comparison is
  read-only and must not advance rounds or consume random draws.
- [x] Clone an existing scenario's configuration and seed into a new, paused tab
  at round zero. Keep the original intact. This is an experiment clone, not a
  fork of the original's current participant state.
- [x] Allow small parameter edits to the clone, using the existing explicit
  Apply & reset behavior.
- [x] Delete scenarios and their associated state/history. If the selected
  scenario is deleted, select another available tab without starting playback.
  Keep the final Comparison tab; handle an empty scenario collection gracefully.
- [x] Scope Reset and configuration changes to the selected scenario only.

### Comparison view

- [x] Overlay inequality histories for selected scenarios: Gini, top wealth
  shares and bottom-50% share, with clear scenario labels.
- [x] Compare current distributions using Lorenz curves and a wealth histogram
  or percentile plot. Use consistent axes and histogram bins across scenarios.
- [x] Show a comparison table containing round, seed, total wealth, mean, median,
  Gini, top-1% share, top-10% share, bottom-50% share and zero-wealth count.
- [x] Allow a reference scenario and display each scenario's differences from it.
  Show percentage-point differences for shares, absolute differences for Gini,
  and currency differences for wealth. Label any relative percentages explicitly
  and handle a zero reference value without division by zero.
- [x] Highlight changed configuration parameters alongside outcome differences,
  so the user can see what differs between experiments.
- [x] Use text, signs and labels as well as color to highlight differences.
- [x] Display round counts prominently. Unequal-round results must be labeled;
  do not present them as matched comparisons or extrapolate missing history.
- [x] Make matching a target round convenient while preserving the rule that
  only the selected scenario advances. Do not add background “run all” behavior.
- [x] Compare historical aggregate metrics where available, but do not imply
  that past participant distributions are stored. Initially, distribution plots
  describe each scenario's current round.

### First acceptance experiment

1. Create a scenario with wealth-biased investment, wealth tax and redistribution
   to the bottom 20%.
2. Clone it with the same seed and all the same parameters.
3. Change only the clone's redistribution target to the bottom 50%.
4. Run each scenario separately to the same round, selecting its tab to run it.
5. Open Comparison and inspect overlaid charts, the parameter difference and
   outcome differences in the table.
6. Delete the clone without changing the original's state or results.

### Correctness and usability checks

- [x] Inactive scenarios remain exactly unchanged, including PRNG state.
- [x] Switching tabs or opening Comparison leaves no stale playback timer.
- [x] Clones share no mutable state, configuration arrays or histories.
- [x] Identical clones run for the same number of rounds yield identical results.
- [x] Switching tabs between batches produces the same result as uninterrupted
  execution of the same number of rounds.
- [x] Deleting a running scenario stops its timer and removes it from comparison.
- [x] Existing single-scenario trajectory fixtures continue to pass unchanged.
- [x] Tabs support keyboard navigation, selected-state semantics and narrow
  screens. Scenario identity remains stable when tabs are renamed or deleted.

Later, extend URL sharing or local persistence to named scenario collections.
Share configurations and seeds, not large simulation histories.

## Controlled comparison principles

- Change one mechanism or parameter at a time when trying to isolate its effect.
- Existing income-tax and wealth-tax presets also differ in redistribution
  recipients. Comparing those presets does not isolate the effect of tax type.
- V1 reuses a sequential stream: adding a process can desynchronize subsequent
  draws. V2 couples corresponding keyed random inputs across mechanisms. Neither
  guarantees identical recipients once wealth-dependent weights diverge. Taxes
  themselves consume no draws even in v1.
- Keep starting conditions and round counts matched where meaningful.
- Do not treat one stochastic trajectory as an expected outcome or require Gini
  to rise every round. Use paired multi-seed effects in Experiments to describe
  variation. Their empirical ranges are not confidence intervals.

## Tax relief for the wealthiest fraction (implemented)

Explore the proposed “tax loopholes for the richest 5%” as an explicit hypothetical
mechanism: **a tax discount available to the wealthiest fraction**. This models
unequal access to relief, not the details of any particular tax system.

Implemented first version:

- [x] Configure the eligible wealth fraction, initially the richest 5%.
- [x] Rank after economic processes but before any taxes. Freeze membership for
  the whole tax phase and recalculate it each round.
- [x] Break wealth ties deterministically by participant ID without reordering
  participants. Explain that ties at an equal start grant arbitrary IDs the
  initial advantage.
- [x] Configure the affected tax and discount fraction independently. Preserve
  the existing choice of taxable income flows.
- [x] Apply the discount to liability before the existing available-funds cap.
  For example, a 20% rate with an 80% discount becomes 4% for eligible participants,
  subject to available wealth.
- [x] Redistribute only actual tax collections. Foregone collections remain with
  participants; they are not externally created wealth.
- [x] Record tax collectible without relief, actual tax collected, and their
  difference in the ledger. Distinguish relief from inability to pay.
- [x] Add top-5% wealth share, group effective tax rates, tax revenue and
  redistribution amounts to the relevant comparisons. Define the effective-rate
  denominator and its zero-base behavior explicitly.
- [x] Compare an otherwise identical pair with relief disabled versus enabled.

Required invariants:

- Zero discount reproduces the existing trajectory exactly and adds no random
  draws.
- Full discount eliminates the selected tax for eligible participants.
- Eligibility does not change partway through tax collection.
- Holding the pre-tax state and tax base fixed, relief cannot increase the
  affected participant's tax collection.
- Participant ledger reconciliation, no debt, finite state and
  taxes-collected-equals-redistribution-paid continue to hold.

Fixed privilege is also available explicitly: the lowest participant IDs retain
eligibility regardless of wealth. It remains distinct from current-wealth ranking.

## Other experiment ideas

| Scenario | Question to explore | Modeling choice to make explicit |
| --- | --- | --- |
| Progressive taxation, with and without top-group relief | How does unequal relief change a progressive policy's effect? | Marginal brackets, taxable flows and where relief applies. |
| Unequal starting wealth, holding total wealth constant | How persistent is an initial advantage? | Starting distribution and assignment to fixed participant IDs. |
| Equal labor income alongside capital returns | How do additive income and capital-scaled gains interact? | External funding versus transfers from other participants; separate taxable labor and capital flows. |
| Minimum investment requirement | Can opportunity access exist without enough capital to participate? | Whether an unaffordable opportunity is skipped or reassigned; baseline access does not supply funding. |
| Shared versus independent investment shocks | How does correlated risk affect individual outcomes and aggregate volatility? | Match marginal return distributions while changing correlation. |
| Essential spending alongside income | How does a fixed expense affect people with different resources? | Who receives spending, whether it leaves the modeled economy, and insufficient-funds behavior. |
| Permanent privilege versus current wealth eligibility | Does an advantage persist differently when attached to identity? | Fixed membership versus membership recalculated by rank. |

Keep these as separate, interpretable extensions. Do not build all of them merely
because they appear in this roadmap. Scenario tabs, controlled comparison and the first paired experiment runner are
implemented. The revised sequence below puts experimental measurement before
additional tax variants.


## Revised priority — paired experiment workbench (first release implemented)

The next unit of analysis is Δ(s,t) = M(treatment,s,t) − M(control,s,t), paired
before aggregation. Preserve hand-built Scenario/Comparison tabs alongside a
separate Experiments mode. Forking from the current round is lower priority per
user preference; it is not needed for this first release.

- [x] Explicit v2 keyed common random numbers; preserve v1 URLs and exact fixtures.
- [x] Separate transfer pairing/coins, external shocks, selection and return keys.
- [x] Deterministic process-type occurrence matching; document its limits.
- [x] Run 1–1,000 paired seeds from equal initial conditions to a common horizon.
- [x] Use applied scenario configurations or the built-in wealth-tax comparison.
- [x] Show changed configuration fields and inspect shared rules before running; allow a bundle of changes
  without claiming it isolates one mechanism.
- [x] Execute in one cancellable browser worker. A local 10,000-round measurement
  took about 1.29 seconds; multi-seed runs would block interaction on the main thread.
- [x] Report median paired Δ, empirical 10–90% range, strict probability of lower
  Gini and ties; include actual cumulative taxes and redistribution.
- [x] Plot checkpoint effect bands, paired-effect histograms and final median Lorenz
  curves. Retain request provenance and allow JSON downloads.
- [x] Stop on failed seeds; never silently drop overflow or report partial estimates.
- [x] Add mouseover, keyboard and touch explanations across composer, metrics,
  comparison and experiment results; explain units, timing and statistical limits.

Verification for this release (2026-09-07): 78 tests passed, including untouched
v1 and separate v2 trajectory fixtures; type checking and production build passed.
Real-browser checks included 100 pairs × 1,000 rounds, exported paired arithmetic,
visible effect histograms, identical-rule zero effects, and mobile tooltip placement.

### Next — measurement and a simple benchmark economy

- [ ] Mobility: Spearman rank correlation, quintile transition matrix, bottom-
  quintile escape, top-quintile persistence and mean absolute percentile movement.
  Choose a reference round explicitly. Equal starting wealth has no meaningful
  initial hierarchy: use midranks and report undefined correlation when variance
  is zero. Deterministic ID tie-breaking for quintiles must be disclosed as
  arbitrary membership, not evidence of initial social rank.
- [ ] Opportunity capture: top-10% and bottom-50% opportunity shares, external-gain
  shares and opportunity-access Gini. Define whether group membership is frozen
  at a checkpoint or measured immediately before each event; these answer different
  questions. Separate realized opportunity counts from expected access probabilities.
- [ ] Add equal additive labor income as an external wealth-creation process.
  Preserve separate gross labor, capital and transfer ledger flows and tax bases.
- [ ] Add a “Capital Economy” benchmark: equal start, +€100 labor/person/round,
  one opportunity/round, access exponent 1, explicit baseline, 20% capital deployed,
  70% chance +30%, 30% chance −20%, optional exchange and no debt. Explain each
  mechanism and per-round rates. Keep current presets for analytical comparisons.

### Next — Treasury and controlled policy ablations

- [x] Explicit government holdings, private wealth and total modeled wealth.
  Collection transfers participant wealth to Treasury; retention creates no money.
  The implemented fiscal invariant is:
  change in Treasury = collected taxes − payouts (absent other fiscal flows),
  private + Treasury changes only by external creation/destruction.
- [ ] Compare no tax; tax retained; tax + universal; tax + bottom 50%, 20%, 10%.
  Equal tax rules do not hold future revenue constant once trajectories diverge.
  A clean fixed-budget targeting experiment needs an explicit shared budget.
- [ ] Equal-budget transfer shapes: universal, bottom fractions, a tapered negative
  income tax and guaranteed minimum wealth. Define initial Treasury endowment,
  funding, unspent balance and insufficient-funds behavior. A €1,000 payout cannot
  occur from an empty Treasury without an explicitly modeled funding source.
- [ ] Tax base: no tax, labor, capital, wealth, labor+capital. Compare both statutory
  rates and approximately revenue-equivalent schedules. 10% of income and 10% of
  wealth are different bases; equal nominal rates do not isolate incidence.
- [ ] Progressive marginal brackets, with exemption varied separately. Compare a
  flat schedule and progressive schedule at matched expected cumulative revenue.
- [x] Implement rich-group relief using the detailed specification above.
- [ ] Calibrate rich-group relief experiments: compare
  baseline, relief at the same rates, and relief with adjusted rates to approximately
  restore revenue. Distinguish dynamic top 5% from five fixed privileged identities.
- [ ] Revenue calibration: specify target horizon, calibration seeds, tolerance,
  rate bounds and infeasible targets. Validate on separate seeds. Do not assume
  cumulative revenue is monotone in the rate under dynamic opportunity feedback;
  report achieved revenue and residual mismatch. Matching expected total revenue
  does not also match its timing, every seed's budget or each person's tax burden.

### Advanced experiments

- [ ] Parameter sweeps: policy ΔGini over access α in {0, .5, 1, 1.5, 2} and payoff
  β in {0, .5, 1}. Current payoff choices are fixed/proportional, not a continuous β;
  define reference units and capital caps before adding intermediate exponents.
  Use paired seeds at each cell and show empirical variation, not just a heat map.
- [ ] Factorial matrix: 16 configurations for four binary mechanisms; report main
  effects and interaction contrasts. Define each factor so all cells are meaningful
  (targeting without tax needs explicit funding). For two factors the interaction
  contrast is M11 − M10 − M01 + M00 on the same metric and paired seed.
- [ ] Timing/frequency: compare periodic tax with r_round = 1 − (1 − r_period)^(1/n).
  This matches compounding on an otherwise unchanged taxable stock; it does not
  guarantee equal revenue under changing wealth, exemptions or redistribution.
- [ ] Fork from current state, when needed for corrective-policy experiments:
  copy participant state, round, ledger/history and future random coordinates;
  preserve reset-to-zero cloning as a distinct operation. Compare prevention from
  round zero with intervention after concentration; do not conflate the questions.

For every new control or output, ship an adjacent explanation of what it means,
its units, what is held constant, and any tie/ranking/funding assumption. Prefer
interpretable, canonical experiments over a growing list of unexplained switches.


## Treasury and loopholes release — 2026-09-08

- [x] Retain tax revenue optionally; preserve full current-revenue redistribution
  as the default. Treasury begins at zero and has no returns or spending.
- [x] Track private wealth, Treasury and their conserved modeled total in current
  views, historical comparisons and paired experiments.
- [x] Current-richest and fixed-ID relief groups; selected-tax discounts before
  funds caps; frozen pre-tax membership; deterministic percentile ties.
- [x] Participant and round relief attribution, group effective rates, top-5% share,
  checkpoint relief and cumulative relief. Explain local forgone collections versus
  a full counterfactual revenue difference.
- [x] Contextual explanations, configuration URL round-trips, cloning and paired
  experiment support. Existing v1/v2 trajectory fixtures remain unchanged.

Revenue-equivalent calibration and spending old Treasury reserves remain separate
work. Identical tax rules are not a fixed shared budget once trajectories diverge.

Verification: 88 tests pass, including the original v1/v2 fixtures and new fiscal
trajectory fixtures. Production build and desktop/mobile browser checks pass;
paired fiscal outputs and sharing were exercised through the real worker/UI.
