# Wealth Lab

A fully client-side laboratory for wealth distributions. Start 100 participants
with equal wealth, compose economic rules, and inspect the resulting trajectory.
This is an educational stochastic model, not a macroeconomic forecast.

## What we are building

A policy experiment workbench with three complementary views: fixed-identity
participant trajectories, hand-built scenario comparisons, and repeated paired
control–treatment experiments. The engine separates participant transfers, external
wealth creation/destruction and fiscal policy. Seeded models and exact regression
fixtures make changes reproducible and refactors reviewable.

The current implementation includes common random numbers, paired effect summaries,
Treasury retention, hypothetical tax relief and scenario mobility. Next we are adding
paired mobility and opportunity-capture measurements, then labor income and controlled policy ablations.
[TODO.md](TODO.md) tracks scope and completion; [the simulation contract](src/simulation/AGENTS.md)
defines the mathematical rules. Feature changes should update both their explanatory
UI and these documents, and land in separate tested Git commits.

## Run

Requires Node.js 22.12+ (or a newer compatible release) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. `npm run build` produces a static site in
`dist/`; `npm run preview` serves that build locally. No backend, accounts, remote
assets or analytics are required.

## Experiment

Choose a preset or edit the composer, then **Apply & reset**. Edits pause playback
and remain pending until applied. **Step** advances one round; **Run / Pause**
controls playback; **Reset** restores the active experiment and seed. Speed changes
only the number of rounds executed per playback tick. **Share experiment** puts
model version, seed and the complete active configuration in a URL, starting at
round zero when opened.

## Scenario workspace

Each scenario has a named tab with independent applied rules, draft edits, seed,
participant state, ledger, history, speed and target round. Switching tabs pauses
playback; returning to a tab does not restart it. Arrow keys, Home and End navigate
the tab list. New scenario starts from the default preset; choose another preset
in its composer as needed.

**Clone scenario** copies the applied configuration and seed into a fresh, paused
run at round zero. Apply pending edits before cloning. **Delete scenario** removes
that scenario and its history. Reset affects only the selected scenario.

Use **Run to target** to stop exactly at a chosen round, including at higher
playback speeds. Run each scenario separately to the same target for a matched
comparison. Continuous **Run** is still available.

The final **Comparison** tab pauses all scenarios. Select scenarios and a reference
to inspect metric differences and changed configuration parameters. Shares use
percentage-point differences; Gini and currency differences are absolute. Choose
**Same historical round** for a table at a round completed by every selected
scenario. History charts show all completed rounds; Lorenz and percentile charts
always describe current participant distributions on shared scales. Different
current rounds are explicitly labeled, and missing data is never extrapolated.

For example, run the investment + wealth redistribution preset, clone it, change
only the recipient fraction from 0.2 to 0.5, and run both to round 100. Comparison
will show that parameter difference alongside the resulting distributions.

Scenarios live in this page until reload. Sharing still exports only the selected
scenario's applied configuration and seed, not the entire workspace or histories.
Saving and sharing scenario collections remains future work.

## Paired experiments

Open **Experiments** for repeated control–treatment comparisons. Choose the built-in
no-tax / 1% wealth-tax investment pair, or select applied configurations from your
scenario tabs. To test bottom 20% versus bottom 50%, apply those changes to two
scenarios first, then select them as control and treatment. Pending edits and current
participant states are not used. Enter the seed count, first seed, horizon and
additional checkpoints, then **Run experiment**.

Both branches start equally at round zero for each consecutive seed. The runner
supports 1–1,000 seed pairs, horizons up to 10,000 rounds, and up to 25 checkpoints.
Default: 100 pairs, 1,000 rounds. A pair means two simulations. A dedicated browser
worker keeps controls responsive; cancel explicitly or leave Experiments to stop.
Opening Experiments pauses scenario playback. Returning does not resume playback.

For each seed and checkpoint, compute **Δ = treatment − control** first. The table
reports the median and 10th–90th percentiles of those paired differences, alongside
separate control and treatment medians. The median paired difference can differ
from the difference of medians. Share differences are percentage points. The range
is empirical variation across seeds, **not a confidence interval**. “Gini lower”
is the fraction of pairs with a strictly negative difference; ties are separate.

Charts show checkpoint median effects with empirical bands, an effect histogram,
and pointwise median final Lorenz curves. Lorenz curves always describe the final
horizon; they are not representative individual runs. Actual cumulative tax revenue
and redistribution are included. Matching tax rates does not match revenues, and
matching the redistribution rule does not hold its budget constant.

**Download results** saves JSON containing both configurations, model version,
seed range, checkpoints and paired observations. Results retain their completed
request when setup inputs change. Reload loses unsaved results. A failed or cancelled
batch does not publish a partial estimate or silently omit problematic seeds.

### Randomness models

**Version 1** preserves every existing Mulberry32 trajectory and shared URL.
**Version 2** uses keyed common random numbers: seed, channel, starting round,
process occurrence and event identify a draw. Pairing, transfer coins, shocks,
opportunity selection, opportunity returns and universal returns have separate
channels. Changing an unrelated mechanism's draw count no longer shifts all later
random inputs. Taxes already consume no randomness in v1, so changing only tax
rates did not shift its stream either.

V2 implements Philox4x32-10 and is checked against the official
[Random123 known-answer vectors](https://github.com/DEShawResearch/random123/blob/main/tests/kat_vectors).
Corresponding instances are matched by process type and occurrence order. Adding
an unrelated process preserves keys; reordering multiple instances of the same
type can change correspondence. The same selection uniform may pick a different
person when wealth-dependent weights change. That is a modeled downstream effect.

The scenario composer offers an explicit model selector and reset. Existing presets
remain v1. Batch experiments explicitly run **v2 copies** of the selected rules;
they leave the source scenario configuration and state intact. V1 and v2 outcomes
are not expected to match. Neither coupling nor more seeds validates the economic
assumptions or guarantees variance reduction for every comparison.

### Explanations

The **?** controls explain inputs, tax semantics, metrics, pairing and statistical
summaries. Hover, keyboard-focus or tap to open; press Escape or tap outside to
close. Help never changes parameter values. Long horizons can yield extremely large
wealth in the uncapped investment model; large currency results use scientific
notation, while downloads retain the numeric values.

The fixed 10 × 10 SVG grid preserves identity. Circle **area** represents wealth
share; color represents gain, loss or no change during the latest round. Select a
participant by pointer or keyboard for numeric ledger attribution, including when
their wealth is zero. The charts show historical inequality and the Lorenz curve.

Included mechanisms:

- Pairwise fixed-stake exchange, with payments capped by payer funds.
- Independent external ± shocks, with losses capped at zero.
- Sequential capital opportunities, with separate wealth-biased access and fixed
  or proportional capital deployment.
- Universal independent multiplicative investment returns.
- Gross-gain income tax, wealth tax with an exemption, and universal or poorest-
  fraction redistribution of current collected revenue, or Treasury retention.
- Optional tax liability discounts for a current-wealth or fixed-ID group.

All rates are **per round**. The default opportunity preset uses 10 events per
round, 65% success, +40% / −25% returns on deployed capital (17.25% expected return),
10% deployment, access exponent 1 and baseline access €100. This baseline changes
access, not investable wealth. Fixed capital cannot exceed available wealth.

The order is transfers → external processes → configured taxes → redistribution →
metrics. Income tax uses gross positive external gains, transfer gains only, or both; it does not offset losses, and collection cannot exceed available
wealth. Bottom-fraction redistribution ranks after taxes, breaks ties by ID, and
rounds recipient counts up. The initial model supports no debt only.

## Treasury and tax relief

In **Taxes & redistribution**, choose **Retain in Treasury (no redistribution)**
to keep collected taxes in a government account. It starts at zero, earns no
returns and makes no payments. Universal and poorest-fraction modes still pay out
all current-round tax collections. Resets clear reserves; accumulated reserves
are never spent automatically. No debt, government spending or external funding
is introduced.

Metrics now distinguish **Private wealth**, **Treasury** and **Total modeled
wealth = private + Treasury**. Gini, shares and circles describe private wealth.
Tax retention transfers wealth to government rather than destroying it. Both
scenario histories/comparisons and paired results include these amounts.

Enable **Tax relief / loophole** to choose a group, eligible fraction, liability
discount and affected tax. Defaults: wealthiest 5%, 80% discount, wealth tax.
“Currently wealthiest” ranks after economic processes and before taxes; membership
stays frozen across all taxes, then is recalculated next round. “Fixed participant
group” always privileges participants 1 through the selected count. Equal-wealth
ties favor lower IDs, creating an explicitly arbitrary initial advantage.

Relief discounts liability before the available-funds cap. For example, a 20%
rate with an 80% discount becomes 4% for eligible people. A discount may still
produce no reduction in actual collection if both liabilities exceed available
wealth. Participant inspection and round accounting expose eligibility, collectible
tax before relief, actual tax, collection forgone and group effective rates. Relief
remains with participants; it is not another payment. Zero discount leaves economic
outcomes unchanged. New options work with both randomness versions, preserving
all original configuration trajectories.

The **Tax relief this round** and **Cumulative tax relief** outputs measure local
collections forgone at each assessment. They do not estimate all downstream effects
on future tax bases or investment access. Use paired experiments to measure those
outcome differences. Group effective rates use the selected assessed bases and are
undefined when that base is zero; selecting both taxes adds income and wealth bases.

To compare retention and targeting, clone a taxed scenario and change only revenue
destination. To compare relief, clone it and enable relief in the treatment. Select
the two applied scenarios in Experiments. Matching tax rates does not match future
revenue, and this release does not calibrate revenue-equivalent tax rates.

## Mobility

The **Who moves up or down?** panel compares participant identities at a stored
reference round with the current round. Initially the reference is round zero.
Run to a meaningful round, choose **Use current round as mobility reference**, then
continue playback. Capturing pauses the scenario without altering its engine state.
Only one participant snapshot is retained per scenario; it survives tab switches,
but resets and clones start again at round zero. It is not exported in config URLs.

Outputs include Spearman rank correlation, mean absolute percentile-rank movement,
bottom-quintile escape, top-quintile persistence and a quintile transition matrix.
These are endpoint comparisons, not counts of intermediate moves. Correlation and
movement use average ranks for ties; correlation is undefined when either endpoint
is entirely equal. Quintiles contain exactly 20 people, using ID to break wealth
ties. At an equal start those groups are arbitrary, not established social ranks.
Mobility currently describes each live scenario; paired batch mobility reporting
is a subsequent extension.

## Code and verification

- `src/simulation/`: pure TypeScript engine, types, seeded PRNG, configuration,
  presets, metrics and tests. No React, browser globals or clock dependencies.
- `src/simulation/AGENTS.md`: extracted mathematical invariants, explicit model
  semantics and the refactoring contract.
- `src/experiments/`: pure paired runner, summaries and browser worker.
- `src/components/`: grid, inspection, composer, contextual help and Observable Plot charts.
- `src/workspace.ts`: pure scenario lifecycle and playback state transitions,
  including rejection of stale timer ticks.
- `src/App.tsx`: accessible tabs and the single active-scenario playback timer.
- `src/components/ScenarioView.tsx`: scenario controls, inspection and URL sharing.
- `src/comparison.ts` and comparison components: metric differences, applied
  parameter comparison and charts. State advances independently of charts or CSS.

```sh
npm test
npm run typecheck
npm run build
```

Tests include analytical examples, fast-check economic invariants, scenario
isolation and lifecycle, target-round playback, comparison formatting, UI controls,
paired effects, keyed randomness, accessible help, and exact trajectory regression
snapshots for all eight presets in both model versions at rounds 1, 10 and 100. Snapshots retain metrics and a SHA-256 digest of the complete state
(including participants, ledger and PRNG state), keeping the fixtures compact.
Do not update these fixtures during a behavior-preserving refactor. A failed
fixture requires investigation even if all mathematical invariants still pass.
There is no lint configuration yet; TypeScript checks unused declarations.

The engine composes arrays of processes and taxes. The initial UI exposes one
transfer process, one external process, and one of each tax, income tax first.
Shared URLs outside that composer scope are rejected with an explanation rather
than silently hiding active rules. Aggregate history, the latest participant state and one mobility reference
are retained in scenarios; batches retain checkpoint aggregates
and final Lorenz shares. Forking, labor income, progressive brackets,
revenue calibration, debt and saved scenario collections remain future work.
See [TODO.md](TODO.md) for the next experimental capabilities.
