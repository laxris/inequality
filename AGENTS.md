# AGENTS.md

## Purpose

This repository contains a small, fully client-side web application for simulating and visualizing the evolution of wealth distributions.

The core visualization represents **100 participants in a fixed 10 × 10 grid**. Each participant starts with an equal share of total wealth unless a simulation preset specifies otherwise.

Participants remain spatially identifiable throughout a simulation. Their wealth changes over time, and their visual size represents their share of total wealth.

The application is intended to be:

* interactive;
* mathematically interpretable;
* reproducible;
* educational without being simplistic;
* explicit about modeling assumptions;
* easy to extend with new economic processes and policy interventions;
* fully usable without a backend.

The project is not intended to be a realistic macroeconomic model. It is a laboratory for exploring how relatively simple stochastic rules can affect distributions over time.

Agents working on this repository should prioritize **correctness of the model and clarity of interpretation over visual novelty or architectural complexity**.

---

# 1. Product model

The application represents a population of participants:

```ts
interface Participant {
  id: number;
  wealth: number;
}
```

The default population is:

```text
100 participants
10 × 10 fixed grid
equal initial wealth
1% of total wealth each
```

The visual grid should preserve participant identity.

Do not reorder participants by wealth unless implementing a separate explicitly labeled visualization.

A participant should ordinarily remain in the same grid cell throughout a run.

---

# 2. Fundamental modeling distinction

The simulator distinguishes between three conceptually different categories of operation:

1. **Transfers**

   * Wealth moves between participants.
   * Aggregate wealth is normally conserved.

2. **External economic processes**

   * Wealth can be created or destroyed.
   * Aggregate wealth may therefore change.

3. **Policies**

   * Taxes, transfers, redistribution, floors, etc.
   * Policies generally redistribute existing wealth unless explicitly modeled otherwise.

Do not collapse these concepts into a generic `wealth += x` abstraction at the application level.

Maintaining this distinction is important both analytically and for future visualization.

A simulation round should conceptually resemble:

```ts
state = runTransferProcesses(state, context);
state = runExternalProcesses(state, context);
state = applyPolicies(state, context);
state = calculateMetrics(state);
```

The precise internal API may differ, but these conceptual boundaries should remain visible in the code.

---

# 3. Preferred technology stack

Unless the existing repository already establishes a different compatible convention, prefer:

* **Vite**
* **React**
* **TypeScript**
* **SVG**
* **Motion / `motion/react`** for visual transitions
* selected D3 utility packages such as:

  * `d3-scale`
  * `d3-array`
* **Observable Plot** for analytical charts
* **pure-rand** or another explicit deterministic PRNG
* **Vitest**
* **fast-check** for property-based tests
* ordinary CSS or CSS Modules

Avoid adding major dependencies without a clear benefit.

In particular, do not introduce these merely because they are familiar:

* Redux
* MobX
* large UI frameworks
* Three.js
* PixiJS
* Canvas rendering
* WebGL
* D3 DOM ownership/selections
* backend services
* databases

For 100 participants, SVG is more than sufficient.

---

# 4. Architecture

Keep the simulation engine independent from React.

A useful high-level structure is:

```text
src/
  app/
  components/
  simulation/
    engine/
    processes/
    policies/
    metrics/
    random/
    presets/
    types/
  visualization/
  charts/
  hooks/
  utils/
  styles/
```

This is guidance rather than a mandatory exact directory structure.

The important boundary is:

```text
simulation code
    MUST NOT depend on React

React/UI code
    MAY depend on simulation code
```

The simulation engine should be independently testable.

Avoid business logic inside React components.

---

# 5. Simulation state

Prefer explicit immutable or effectively immutable state transitions.

A representative structure might be:

```ts
interface SimulationState {
  round: number;
  participants: Participant[];
  totalWealth: number;
}
```

Do not trust cached `totalWealth` unless it is reliably derived or validated.

It is acceptable instead to calculate total wealth from participants when the population is only 100.

Correctness is more important than premature optimization.

---

# 6. Round context and ledger

Every simulation step should preserve enough information to explain why participant wealth changed.

Prefer maintaining a round ledger rather than only storing final wealth.

For example:

```ts
interface ParticipantRoundLedger {
  participantId: number;

  transferGains: number;
  transferLosses: number;

  externalGains: number;
  externalLosses: number;

  taxesPaid: number;
  transfersReceived: number;
}
```

A round-level ledger may contain:

```ts
interface RoundLedger {
  participants: ParticipantRoundLedger[];

  totalTransfers: number;
  externalWealthCreated: number;
  externalWealthDestroyed: number;
  taxesCollected: number;
  redistributionPaid: number;
}
```

Exact types may evolve.

The principle is important:

> A participant's change in wealth should remain explainable.

This enables future:

* tooltips;
* event inspection;
* round replay;
* stacked attribution charts;
* debugging;
* model validation.

---

# 7. Deterministic randomness

Do not use `Math.random()` for simulation mechanics.

All stochastic behavior must use an explicit seeded PRNG.

Given identical:

* initial state;
* configuration;
* seed;
* number of rounds;

the resulting simulation should be identical.

Example conceptual API:

```ts
interface RandomSource {
  next(): number;
  integer(min: number, max: number): number;
}
```

Simulation functions that require randomness should receive it explicitly.

Prefer:

```ts
runProcess(state, config, rng)
```

over:

```ts
runProcess(state, config)
```

where randomness is hidden globally.

---

# 8. Seeds and reproducibility

Every simulation should have a visible seed.

Users should be able to:

* reset using the same seed;
* generate a new seed;
* reproduce a previous experiment;
* ideally share a simulation configuration through the URL.

The complete experiment should eventually be serializable from:

```text
initial conditions
processes
policies
parameters
seed
```

Where practical, encode configuration into query parameters or another client-side shareable representation.

Do not require accounts or a server for reproducibility.

---

# 9. Transfer process: fixed-stake exchange

A central baseline simulation is pairwise fair exchange.

Example:

```text
randomly pair participants

flip a fair coin

winner receives 50
loser pays 50
```

This is a **transfer process**.

Except for wealth-floor behavior, it should conserve aggregate wealth.

For a closed economy:

```text
sum(wealth after) === sum(wealth before)
```

within appropriate floating-point tolerance.

The fixed-stake fair exchange process is analytically important because it demonstrates that:

> fairness of individual stochastic transactions does not imply equality of resulting wealth.

---

# 10. Independent gain/loss shocks

A separate process may give each participant an independent outcome:

```text
50%: +50
50%: -50
```

This process does **not necessarily conserve total wealth**.

Do not present it as equivalent to pairwise exchange.

It represents external gains and losses.

UI copy and documentation should distinguish:

```text
Fixed-stake exchange
```

from:

```text
Independent external shocks
```

---

# 11. Wealth floors and insufficient funds

Behavior when a participant cannot afford a transfer must be explicit.

Do not silently choose semantics.

Potential supported modes include:

### No debt

```ts
actualTransfer = Math.min(stake, payer.wealth);
```

### Debt allowed

Participant wealth may become negative.

### Bankruptcy

Participant reaches zero and may no longer participate.

### Guaranteed floor

A policy or external transfer prevents wealth from dropping below a configured level.

The initial/default implementation should generally prefer **no debt**, unless a preset explicitly says otherwise.

Whichever behavior is active must be visible in the configuration.

---

# 12. External capital opportunity process

The simulator supports events representing opportunities to create or destroy wealth outside ordinary participant-to-participant transactions.

Examples include:

* exploiting a natural resource;
* business investment;
* startup investment;
* development of intellectual property;
* productive capital investment;
* acquisition of a valuable asset.

These events may have:

* positive expected value;
* downside risk;
* unequal accessibility;
* payoff size related to existing capital.

This is an **external process**, because it can change aggregate wealth.

---

# 13. Wealth-biased opportunity access

For participant `i` with wealth `wᵢ`, opportunity access may be weighted by:

```text
accessWeightᵢ = (wᵢ + w₀)^α
```

and:

```text
P(i receives opportunity)
    = accessWeightᵢ / Σ accessWeightⱼ
```

Where:

### `α`

Controls how strongly wealth affects opportunity access.

Useful interpretation:

```text
α = 0
everyone equally likely

0 < α < 1
wealth advantage with diminishing returns

α = 1
probability proportional to wealth

α > 1
superlinear wealth advantage
```

### `w₀`

Represents baseline access independent of existing financial wealth.

It prevents participants with zero wealth from necessarily becoming permanently excluded.

Possible interpretations include:

* human capital;
* credit;
* networks;
* institutional access;
* luck;
* baseline economic opportunity.

Do not hard-code zero-wealth exclusion unless that behavior is explicitly desired.

---

# 14. Separate access from payoff scaling

Do not conflate:

1. being more likely to receive an opportunity;
2. being able to exploit an opportunity at larger scale.

These should be separately configurable.

A useful model is:

```text
opportunity access ∝ (wealth + baseline)^α

capital deployed ∝ wealth^β
```

or equivalent.

This allows experiments such as:

```text
α = 1
β = 0

wealthier participants get opportunities more often,
but every opportunity is the same size
```

versus:

```text
α = 1
β = 1

wealthier participants both get opportunities more often
and can exploit them with more capital
```

This distinction is analytically important.

---

# 15. External opportunity returns

An external opportunity may have a stochastic payoff.

Simple discrete version:

```text
success probability: 65%
success return: +40%
failure probability: 35%
failure return: -25%
```

Expected return should be calculable and preferably shown in the UI.

For example:

```text
E[r] =
P(success) × successReturn
+
P(failure) × failureReturn
```

The event may have positive expected value while still producing losses in individual cases.

Do not assume external events are always profitable.

---

# 16. Capital deployed versus participant wealth

When returns scale with capital, distinguish participant wealth from capital deployed.

Example:

```ts
capital = participant.wealth * investmentFraction;
delta = capital * returnRate;
participant.wealth += delta;
```

If:

```text
wealth = 10,000
capital deployed = 2,000
return = +30%
```

then:

```text
wealth change = +600
new wealth = 10,600
```

The principal has not been transferred elsewhere.

The external process created `600` of aggregate wealth.

On a `-30%` return:

```text
wealth change = -600
new wealth = 9,400
```

and aggregate wealth declines by `600`.

---

# 17. Multiplicative investment process

The app should be architecturally capable of supporting an alternative process in which all participants receive stochastic returns:

```text
wᵢ,t+1 = wᵢ,t × (1 + rᵢ,t)
```

This differs from wealth-biased opportunity selection.

It represents a world in which investment is universally accessible but gains and losses scale with capital.

This is a useful analytical comparison because multiplicative dynamics alone can produce substantial inequality.

---

# 18. Policies

Policies operate separately from primary economic processes.

Initial policy types should include:

* income tax;
* wealth tax;
* universal redistribution;
* targeted redistribution.

Policies should be composable.

Avoid creating hard-coded simulation variants such as:

```text
coinFlipWithWealthTax
coinFlipWithIncomeTax
coinFlipWithWealthTaxAndRedistribution
```

Instead prefer:

```ts
processes: [...]
policies: [...]
```

This avoids combinatorial explosion.

---

# 19. Income tax

Income tax should operate on appropriate income flows, not blindly on current wealth.

This is another reason for maintaining a ledger.

Possible taxable flows may include:

* transfer income;
* external gains;
* labor income;
* capital gains;

depending on the configured model.

Do not silently redefine a wealth change as taxable income.

Tax semantics must be explicit.

The engine should eventually support progressive brackets.

Example representation:

```ts
interface TaxBracket {
  upTo: number;
  rate: number;
}
```

Example:

```ts
[
  { upTo: 100, rate: 0 },
  { upTo: 500, rate: 0.2 },
  { upTo: Infinity, rate: 0.4 },
]
```

---

# 20. Wealth tax

A wealth tax operates on wealth, potentially above an exemption.

Conceptually:

```ts
taxableWealth = Math.max(0, wealth - exemption);
tax = taxableWealth * rate;
```

Do not confuse wealth tax with tax on investment returns.

---

# 21. Redistribution

Collected taxes may be redistributed using multiple strategies.

Initial useful strategies:

### Universal

```text
all participants receive equal shares
```

### Bottom X%

```text
participants currently in the poorest X%
receive equal shares
```

Potential future strategies include:

* progressive transfer schedules;
* negative-income-tax-style transfers;
* inverse-wealth-weighted transfers;
* guaranteed minimum wealth;
* universal basic income.

Policy architecture should make adding these straightforward.

---

# 22. Policy accounting invariant

Unless deliberately modeling government deficits, administrative costs, or money creation:

```text
taxes collected === redistribution paid
```

within floating-point tolerance.

This should be tested.

Do not accidentally destroy or create wealth through rounding or implementation artifacts.

---

# 23. Round ordering

Ordering affects outcomes.

Therefore it must be deterministic and explicit.

A sensible default ordering is:

```text
1. participant-to-participant transfers
2. external wealth processes
3. taxes
4. redistribution
5. metrics
6. round increment
```

If future simulations require different ordering, make the ordering configurable or clearly define another preset.

Do not change ordering casually.

A change in execution order is a change in the economic model.

---

# 24. Visualization

The primary visualization is a fixed 10 × 10 SVG grid.

Each participant is represented by a circle.

### Circle size

**Circle area**, not radius, should be proportional to wealth share.

Therefore:

```text
radius ∝ sqrt(wealthShare)
```

Do not use:

```text
radius ∝ wealthShare
```

because that causes visual area to scale with wealth squared.

Using `d3.scaleSqrt()` is appropriate.

---

# 25. Negative wealth visualization

If debt is supported, circle area cannot directly encode negative wealth.

Do not apply square-root scaling to negative values.

A future debt visualization should use a distinct encoding, such as:

* positive circle area plus a debt ring;
* color;
* signed bars;
* a secondary view.

Until an intentional representation exists, presets that allow debt should handle negative values explicitly rather than letting the SVG scale break.

---

# 26. Participant positioning

Participant grid position should ordinarily remain fixed.

Do not move rich participants toward the center or sort participants by wealth in the primary visualization.

Fixed positions allow users to track individual trajectories over time.

Separate ordered views may be added later if useful.

---

# 27. Overlap

Very wealthy participants may produce circles larger than their grid cells.

Do not automatically clamp radius merely to preserve grid boundaries.

Clamping destroys the quantitative encoding.

Allow overlap where reasonable.

Consider rendering larger circles first and smaller circles afterward so low-wealth participants remain visible and interactive.

---

# 28. Color encoding

Avoid using color redundantly for wealth if circle area already encodes wealth.

Prefer color for a second variable, such as:

* gain this round;
* loss this round;
* taxed;
* transfer received;
* external opportunity event.

Ensure color is not the only representation of important information.

The application should remain understandable for users with color-vision deficiencies.

---

# 29. Tooltips / participant inspection

Participant inspection should be capable of showing:

```text
Participant ID
Current wealth
Current wealth share
Change this round
Transfers gained/lost
External gains/losses
Taxes paid
Redistribution received
```

Do not show data that cannot be traced back to the simulation ledger.

---

# 30. Animation

Animation should communicate state change rather than decorate the application.

Animate properties such as:

* radius;
* opacity;
* relevant event indicators.

Avoid excessive springiness, particle effects, or motion that makes quantitative comparison harder.

Simulation state should update independently of animation timing.

Do not make economic results dependent on whether an animation completed.

---

# 31. Playback controls

The application should support:

```text
Reset
Step
Run
Pause
```

Useful future controls include:

```text
1×
5×
20×
100×
```

Simulation speed should affect presentation only.

Running 100 rounds quickly should produce the same result as stepping those 100 rounds manually with the same seed.

Test this property.

---

# 32. Analytical metrics

At minimum, plan for:

* total wealth;
* mean wealth;
* median wealth;
* Gini coefficient;
* top 1% wealth share;
* top 10% wealth share;
* bottom 50% wealth share;
* richest participant wealth;
* number of participants at zero wealth.

Additional metrics may be added where analytically useful.

Metrics should live in the simulation/analysis layer rather than React components.

---

# 33. Gini coefficient

Implement Gini carefully.

Test known distributions.

Examples:

### Perfect equality

```text
[1, 1, 1, 1]
Gini = 0
```

### Increasing concentration

Gini should increase as wealth becomes concentrated.

If negative wealth is allowed, explicitly document which Gini convention is used.

Do not assume the standard nonnegative formula remains semantically straightforward with arbitrary negative wealth.

---

# 34. Historical metrics

Store lightweight per-round aggregate metrics for charts.

Do not necessarily retain complete copies of every participant object for every frame indefinitely.

For 100 participants this is initially inexpensive, but keep the data model intentional.

A history point might contain:

```ts
interface HistoryPoint {
  round: number;
  totalWealth: number;
  gini: number;
  top10Share: number;
  bottom50Share: number;
}
```

Full participant snapshots may be retained where replay or timeline inspection requires them.

---

# 35. Secondary charts

Useful analytical charts include:

### Inequality over time

Plot:

* Gini;
* top 10% share;
* bottom 50% share.

### Lorenz curve

Useful for explaining the wealth distribution and Gini.

### Wealth distribution

Histogram or percentile plot.

Observable Plot is preferred for these unless the repository already uses another lightweight charting approach.

Do not manually implement chart primitives that a small chart library already handles well.

---

# 36. Experimental presets

Presets should configure the same general engine rather than invoking separate implementations.

Useful initial presets include:

### Equal start + fair exchange

```text
equal wealth
fixed €50 pairwise fair transfer
no taxes
```

### Equal start + independent shocks

```text
equal wealth
±€50 independent shocks
```

### Equal-access investment

```text
equal opportunity probability
returns scale with deployed capital
```

### Wealth-biased opportunity

```text
P(opportunity) ∝ (wealth + baseline)^α
```

### Wealth-biased scalable investment

```text
wealth-biased opportunity access
+
capital-scaled payoff
```

### Wealth-biased opportunity + redistribution

Same external process plus:

* income tax;
* capital-gains tax;
* wealth tax;
* redistribution;

depending on the experiment.

Preset names should describe mechanics rather than imply political conclusions.

---

# 37. Particularly useful comparative experiment

The architecture should support comparing:

```text
A. fair fixed-stake transfers

B. investment opportunities with equal access

C. investment opportunities with wealth-biased access

D. wealth-biased access + capital-scaled returns

E. D + income/capital taxation

F. D + wealth taxation and redistribution
```

The same initial state and random seed should be reusable where that comparison is mathematically meaningful.

This experiment decomposes:

```text
stochastic inequality
→ multiplicative returns
→ unequal opportunity access
→ unequal scale of exploitation
→ policy effects
```

This decomposition is central to the educational value of the application.

---

# 38. Configuration UI

Prefer a simulation composer over a large collection of special-case buttons.

Conceptually:

```text
PROCESS

Fixed-stake exchange
  stake: 50
  wealth floor: 0


EXTERNAL PROCESSES

Capital opportunity
  events per round: 1
  wealth advantage α: 1
  baseline access: 100
  capital deployed: 10%
  success probability: 65%
  success return: +40%
  failure return: -25%


POLICIES

Income tax
  enabled
  rate / brackets

Wealth tax
  enabled
  rate
  exemption

Redistribution
  bottom 20%
```

Changing a parameter should not require creating a new simulation implementation.

---

# 39. Derived configuration values

Where possible, show useful derived values.

For example, a stochastic investment configuration should display expected return.

If:

```text
success probability = 65%
success return = +40%
failure probability = 35%
failure return = -25%
```

show the calculated expected return.

Do not require users to mentally derive obvious consequences of parameter choices.

---

# 40. Validation

Configuration inputs must be validated.

Examples:

```text
probability ∈ [0, 1]

tax rate ∈ [0, 1]

redistribution percentile ∈ [0, 1]

investment fraction ∈ [0, 1]

wealth ≥ 0 when debt disabled
```

Parameters such as `α` may reasonably exceed `1`, but should have sensible UI ranges.

Prevent NaN and Infinity from entering simulation state.

---

# 41. Numerical behavior

Use JavaScript numbers unless a concrete requirement demonstrates that higher-precision arithmetic is necessary.

This is an educational simulator, not a financial accounting system.

Use approximate comparisons in tests where floating-point arithmetic is involved.

Example:

```ts
expect(totalAfter).toBeCloseTo(totalBefore);
```

Do not introduce arbitrary-precision decimal libraries without need.

---

# 42. Testing strategy

Simulation correctness deserves more testing than UI plumbing.

Use:

* ordinary unit tests;
* deterministic seed tests;
* property-based tests.

Important invariants include:

### Reproducibility

```text
same config + same seed
=> same result
```

### Transfer conservation

For closed transfer processes:

```text
Σ wealth after
=
Σ wealth before
```

### Policy conservation

Absent explicit government spending or money creation:

```text
taxes collected
=
redistribution paid
```

### No-debt rule

When debt is disabled:

```text
wealth >= 0
```

for every participant.

### Identity policy

A zero-rate tax should produce no economic change.

### Playback equivalence

```text
step N times
=
run N rounds
```

given the same starting state and PRNG stream.

### Participant preservation

Ordinary processes should not silently create or delete participants.

### Finite state

After every process:

```text
Number.isFinite(participant.wealth)
```

must remain true.

---

# 43. Property-based testing

Use `fast-check` particularly for mathematical invariants.

Good targets include:

* arbitrary valid wealth distributions;
* arbitrary transfer stakes;
* arbitrary tax rates;
* arbitrary redistribution thresholds;
* arbitrary seeds;
* arbitrary numbers of rounds.

Property tests should test economic invariants, not duplicate implementation details.

When a property fails, retain the minimized counterexample as a regression test if useful.

---

# 44. UI testing

Keep UI tests focused.

Useful tests include:

* pressing Step increments one round;
* Reset restores initial state and PRNG state;
* changing seed changes reproducible trajectory;
* selected process configuration reaches engine correctly;
* invalid configuration is rejected;
* Run/Pause does not change simulation semantics.

Avoid brittle tests tied to exact SVG DOM structure unless necessary.

---

# 45. Accessibility

The primary participant visualization should use SVG elements that can support:

* pointer interaction;
* keyboard focus where appropriate;
* accessible labels.

Do not rely exclusively on hover.

Important quantitative meaning should not depend solely on color.

Controls should use semantic HTML.

Prefer:

```html
<button>
<label>
<input>
<select>
```

over clickable generic `<div>` elements.

Respect reduced-motion preferences.

---

# 46. Responsive layout

Use CSS Grid/Flexbox.

A likely desktop layout is:

```text
visualization | controls
```

with metrics/charts underneath.

On narrow screens:

```text
visualization
controls
metrics
charts
```

The SVG should use an appropriate `viewBox` and scale responsively.

Do not calculate layout using arbitrary device-specific pixel sizes unless necessary.

---

# 47. Performance

Do not prematurely optimize.

The default population is 100.

React + SVG can comfortably handle this workload.

Before introducing:

* Web Workers;
* Canvas;
* WebGL;
* WASM;
* complicated memoization;

measure an actual bottleneck.

A possible future exception is running very large Monte Carlo experiments rather than animating a single 100-person simulation.

Such batch simulation could eventually move into a Web Worker while leaving the main interactive visualization unchanged.

---

# 48. Monte Carlo experiments

Design the simulation engine so that a future analytical mode can execute many runs without React.

Example future feature:

```text
Run this configuration 10,000 times
```

and report:

* expected Gini after N rounds;
* percentile intervals;
* probability top 10% owns > X%;
* probability of participant ruin;
* aggregate wealth distribution.

This is another reason the engine must remain UI-independent and deterministic.

Do not implement this unless requested, but avoid architecture that makes it difficult.

---

# 49. URL state

Where feasible, simulation configuration should eventually be shareable via URL.

Examples of serializable state:

```text
seed
initial wealth
process type
stake
alpha
baseline access
investment fraction
return parameters
tax settings
redistribution settings
```

Do not encode large simulation histories into the URL.

The URL should identify the experiment, not every resulting frame.

---

# 50. Persistence

The application is fully client-side.

Do not introduce a backend merely for:

* preferences;
* saved presets;
* seeds;
* configuration sharing.

Use:

* URL parameters;
* localStorage;

where appropriate.

Backend functionality requires an explicit product decision.

---

# 51. Code style

Prefer readable TypeScript over clever abstractions.

Good:

```ts
const taxableWealth = Math.max(0, wealth - exemption);
const tax = taxableWealth * rate;
```

Avoid unnecessarily compressed expressions when implementing economic rules.

Names should expose modeling meaning.

Prefer:

```ts
wealthTaxRate
opportunityAccessExponent
baselineOpportunityAccess
investmentFraction
externalWealthCreated
```

over:

```ts
rate
alpha
base
fraction
delta
```

inside application-level code.

Short mathematical names are fine inside very local functions where the formula is obvious and documented.

---

# 52. Types

Avoid `any`.

Prefer domain-specific types and discriminated unions.

For example:

```ts
type EconomicProcessConfig =
  | FixedStakeExchangeConfig
  | IndependentShockConfig
  | CapitalOpportunityConfig
  | MultiplicativeReturnConfig;
```

and:

```ts
interface FixedStakeExchangeConfig {
  type: "fixed-stake-exchange";
  stake: number;
  allowDebt: boolean;
}
```

This should make impossible or contradictory states difficult to construct.

---

# 53. Process APIs

Prefer pure transformation functions.

For example:

```ts
function applyFixedStakeExchange(
  state: SimulationState,
  config: FixedStakeExchangeConfig,
  rng: RandomSource,
): ProcessResult
```

rather than classes with hidden mutable state.

Random state may be explicitly threaded or encapsulated behind a deterministic RNG abstraction, but avoid unrelated global mutable state.

---

# 54. Policy APIs

Policies should follow the same compositional style.

For example:

```ts
function applyWealthTax(
  state: SimulationState,
  ledger: RoundLedger,
  config: WealthTaxConfig,
): PolicyResult
```

A policy should expose through its result:

* amount collected;
* amount distributed;
* participant-level changes.

---

# 55. Avoid hidden economic assumptions

Whenever implementing a simulation rule, ask:

```text
Does this conserve total wealth?

Can participants go below zero?

Who receives or loses the difference?

Does probability depend on wealth?

Does payoff size depend on wealth?

When is tax calculated?

What counts as income?

When are participants ranked for bottom-X redistribution?

What happens at percentile ties?

Does policy apply before or after external returns?
```

If the answer materially affects results, encode it explicitly or document it.

Do not make major modeling assumptions merely because they simplify implementation.

---

# 56. Percentile redistribution semantics

When redistributing to the poorest X%, define selection deterministically.

For 100 participants this is straightforward, but behavior should still be explicit.

Suggested approach:

1. sort a copy by wealth;
2. use participant ID as deterministic tie-breaker;
3. select the requested count;
4. do not mutate primary participant ordering.

For:

```text
bottom 20%
```

with 100 participants, select 20 participants.

If population size later differs, document rounding semantics.

---

# 57. Event selection

Weighted participant selection should be implemented carefully.

For weights:

```text
weightᵢ >= 0
```

choose one participant proportionally to weight.

Do not expand participants into repeated arrays proportional to wealth.

Use cumulative weighted sampling or an equivalent correct algorithm.

Handle the degenerate case:

```text
Σ weights = 0
```

explicitly.

---

# 58. Extremely large wealth values

Wealth-biased access with:

```text
(weight + baseline)^α
```

may overflow or become numerically unstable for extreme parameters.

For normal educational ranges this is unlikely.

Still:

* validate configuration;
* ensure weights remain finite;
* consider normalized or log-space calculations if future ranges make this necessary.

Do not silently return broken probability distributions.

---

# 59. Opportunity saturation

Future external-process models may use saturating access functions.

Examples:

```text
log(1 + wealth / k)
```

or:

```text
wealth / (wealth + k)
```

This can model diminishing returns to capital in opportunity access.

Do not bake the power-law access model so deeply into the engine that alternatives require rewriting event selection.

Prefer an access-weight abstraction.

---

# 60. Model extensibility

The engine should make it straightforward to add future processes such as:

* labor income;
* inheritance;
* demographic turnover;
* borrowing;
* interest;
* bankruptcy;
* insurance;
* productivity differences;
* unequal starting conditions;
* correlated shocks;
* inflation;
* asset-price shocks;
* public goods;
* transaction fees;
* charitable transfers;
* consumption;
* savings rates.

Do not implement speculative features now.

Design extension points, not unused frameworks.

---

# 61. Separation between mechanism and interpretation

Code should model mechanisms.

UI copy may interpret them.

For example, the engine should implement:

```text
wealth-biased stochastic external opportunity
```

rather than:

```text
oil tycoon simulator
```

A UI preset may explain that the mechanism can represent something like resource exploitation, business opportunities, investment access, etc.

This keeps the engine general and analytically honest.

---

# 62. Preset descriptions

Preset descriptions should state assumptions clearly.

Good:

> Each round selects one participant for an external investment opportunity. Selection probability is proportional to current wealth. The participant invests 10% of wealth and receives a stochastic return.

Less useful:

> The rich get richer.

Prefer describing mechanism before interpretation.

---

# 63. No normative result hard-coding

The application should not be engineered to produce a predetermined political conclusion.

Policies and processes should be implemented according to their stated rules.

Unexpected outcomes are useful.

Do not alter parameters, randomness, chart scaling, or defaults merely to make a policy appear more or less effective.

---

# 64. Visualization integrity

Do not manipulate visual scales to exaggerate effects.

Important rules:

* area proportional to wealth where size encodes wealth;
* axes should be labeled;
* truncated axes must be obvious;
* log scales must be labeled;
* totals and percentages should be internally consistent.

A surprising result should be explained by the model, not generated by misleading visual encoding.

---

# 65. Comments and documentation

Comment **why**, especially where model semantics are non-obvious.

Good:

```ts
// Use the participant ID as a deterministic tie-breaker so
// bottom-percentile membership is reproducible for equal wealth.
```

Less useful:

```ts
// Sort participants by wealth.
```

Mathematical formulas should have brief explanatory comments where the implementation is not self-evident.

---

# 66. Agent workflow

When making nontrivial changes:

1. inspect existing code before proposing architecture changes;
2. identify the affected economic invariant;
3. implement the smallest coherent change;
4. add or update tests;
5. run relevant tests;
6. run type checking;
7. run linting if configured;
8. run the production build where appropriate;
9. summarize any modeling assumption introduced.

Do not rewrite unrelated parts of the application merely because a different architecture would also work.

---

# 67. Existing repository conventions take precedence

Before changing code, inspect:

```text
package.json
tsconfig*
vite.config*
eslint configuration
existing source structure
existing tests
existing formatting configuration
```

Use existing commands and conventions when reasonable.

Do not assume the exact dependency list described in this file has already been installed.

Do not replace working tooling simply to match this document literally.

This document describes architectural intent.

---

# 68. Dependency policy

Before adding a dependency, consider:

1. Is the functionality difficult to implement correctly ourselves?
2. Does the dependency materially simplify the code?
3. Is it reasonably small for a client-only app?
4. Is it actively maintained?
5. Does it duplicate existing functionality?

Good dependency candidates:

* deterministic PRNG;
* charting primitives;
* animation;
* property-based testing.

Poor dependency candidates:

* trivial utility functions;
* global state for a handful of controls;
* entire design systems for a small interface.

---

# 69. Security and privacy

This application should not require user accounts or personal data.

Avoid:

* analytics by default;
* third-party tracking;
* remote execution;
* unnecessary network requests.

A static deployment should be sufficient.

Do not add external services without an explicit requirement.

---

# 70. Expected commands

Use commands defined by the repository.

A typical Vite project may expose something similar to:

```bash
pnpm dev
pnpm test
pnpm build
pnpm lint
```

Do not assume these exact commands exist.

Inspect `package.json`.

If adding tests or tooling, update scripts consistently.

---

# 71. Definition of done

A simulation-related feature is not complete merely because the UI appears to work.

For a meaningful engine change, verify:

* the modeling rule is explicit;
* seeded execution is deterministic;
* relevant conservation/non-conservation behavior is intentional;
* ledger attribution is correct;
* invalid values cannot corrupt state;
* tests cover the important invariant;
* the UI communicates the rule accurately;
* visualization remains quantitatively honest.

For UI-only changes, verify:

* keyboard interaction where applicable;
* responsive behavior;
* reduced-motion behavior where relevant;
* no semantic changes to simulation outcomes.

---

# 72. Things agents should not do

Do not:

* use `Math.random()` for simulation state;
* put core simulation logic in React components;
* mutate participant ordering for the primary grid;
* use radius linearly for wealth;
* silently allow negative wealth;
* silently change total wealth in a transfer process;
* silently destroy collected tax;
* implement every process/policy combination separately;
* make simulation results depend on animation timing;
* introduce a backend without need;
* overengineer rendering for 100 SVG circles;
* change economic semantics while describing the change as a refactor;
* alter defaults simply to manufacture a more dramatic result.

---

# 73. Core design principle

The best way to think about this project is:

> A deterministic stochastic simulation engine with a visual interface.

The simulation should be independently understandable as:

```text
initial state
+
economic processes
+
external processes
+
policies
+
seed
=
trajectory
```

The visualization then explains that trajectory.

Keep those responsibilities separate.

---

# 74. Product principle

The most interesting behavior in this application should emerge from simple, transparent mechanisms.

Prefer a small number of understandable parameters such as:

```text
stake
return
risk
wealth-access exponent
capital fraction
tax rate
redistribution target
```

over opaque composite models.

A user should be able to understand why changing one parameter changes the resulting distribution.

That interpretability is a core feature, not a limitation.


<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
