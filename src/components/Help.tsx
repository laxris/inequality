import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Hover, keyboard and touch share one explanation, positioned outside clipped tables. */
export function Help({
  label,
  children,
  id: suppliedId,
}: {
  label: string;
  children: ReactNode;
  id?: string;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current || !tooltip.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const box = tooltip.current.getBoundingClientRect();
      setPosition({
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - box.width - 8)
        ),
        top:
          rect.top >= box.height + 8
            ? rect.top - box.height
            : Math.max(
                8,
                Math.min(rect.bottom, window.innerHeight - box.height - 8)
              ),
      });
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !tooltip.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const leave = (target: EventTarget | null) => {
    const node = target instanceof Node ? target : null;
    if (
      !anchor.current?.contains(document.activeElement) &&
      !anchor.current?.contains(node) &&
      !tooltip.current?.contains(node)
    )
      setOpen(false);
  };
  return (
    <span
      ref={anchor}
      className="help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => leave(event.relatedTarget)}
      onBlur={(event) => {
        if (!tooltip.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="help-button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {createPortal(
        <span
          ref={tooltip}
          id={id}
          role="tooltip"
          className="help-content"
          style={position}
          hidden={!open}
          onMouseLeave={(event) => leave(event.relatedTarget)}
        >
          {children}
        </span>,
        document.body
      )}
    </span>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: (id: string, descriptionId?: string) => ReactNode;
}) {
  const id = useId();
  const descriptionId = help ? `${id}-help` : undefined;
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {help && (
          <Help label={label} id={descriptionId}>
            {help}
          </Help>
        )}
      </div>
      {children(id, descriptionId)}
    </div>
  );
}

export const explanations: Record<string, string> = {
  "Wealth per participant (€)":
    "Every participant starts with this amount. Total initial wealth is 100 times this value. Zero is allowed; there is no debt.",
  "Stake per pair (€)":
    "A fair coin chooses the payer in each random pair. Payment is capped by that payer’s available wealth. This moves wealth between people without creating it.",
  "Independent ± shock (€)":
    "Each person independently gains or loses this amount. Losses stop at zero. These are external changes, so aggregate wealth can change.",
  "Events per round":
    "Number of investment opportunities each round. Selection is with replacement: someone can receive several opportunities. Wealth weights update after every event.",
  "Wealth-access exponent α":
    "Controls opportunity access, not payoff size. 0 gives equal access; 1 weights access by wealth plus the baseline; values above 1 amplify the wealth advantage.",
  "Baseline access (€)":
    "An offset in the selection weight (wealth + baseline)^α. It gives people at zero wealth a chance of access, but does not give them money to invest.",
  "Investment fraction (0–1)":
    "The fraction of current wealth exposed to a return. For example, 0.2 invests 20%; a +30% return then increases wealth by 6%. Principal is not separately spent.",
  "Fixed capital (€)":
    "Each opportunity uses this amount of capital, capped by the selected person’s available wealth. Wealth affects access separately from investment size.",
  "Success probability":
    "Chance of the success return. Enter 0.65 for 65%. Failure probability is one minus this value.",
  "Success return":
    "Return on deployed capital, not all wealth. Enter 0.4 for +40%. A positive expected return does not guarantee a gain in a particular run.",
  "Failure return (−1 to 0)":
    "Return on deployed capital when the opportunity fails. −0.25 loses 25% of invested capital; −1 loses all of it.",
  "Income tax rate per round":
    "Tax on the selected gross positive gains in each round. 0.2 means 20%. Losses are not deducted; collection is capped by available wealth.",
  "Rate per round":
    "Wealth tax on current wealth above the exemption, after preceding taxes. 0.01 means 1% each round, not 1% per year.",
  "Exemption (€)":
    "The amount of wealth protected from wealth tax. Taxable wealth is max(0, current wealth − exemption).",
  "Recipient fraction (0.01–1)":
    "Fraction receiving equal shares of collected taxes. 0.2 means the poorest 20 people. Rank is measured after taxes; ties use participant ID.",
  "Random seed":
    "Identifies a reproducible random experiment. Reset restores this seed. Sharing includes the seed and applied rules, not the current trajectory.",
  "Target round":
    "Run until this round, then pause exactly there. Speed affects presentation only. Switching away pauses the scenario.",
  "Comparison round":
    "An already completed round shared by every selected scenario. This changes the table only; distribution charts show current states.",
  Process:
    "External processes can create or destroy modeled wealth. Independent shocks affect everyone; capital opportunities select recipients; universal returns invest for everyone.",
  "Capital deployed":
    "Choose a fixed funded amount or a fraction of current wealth. This controls payoff scale separately from wealth-biased opportunity access.",
  "Taxable gross gains":
    "Select external gains, transfer gains, or both. Only positive flows count; this is not a tax on net change. Labor income is not modeled yet.",
  "Redistribute collected taxes to":
    "Retain sends collected tax to a Treasury starting at zero, with no spending or returns. Universal and poorest-fraction modes pay out all current-round collections. Private wealth plus Treasury is conserved by taxation; retained balances are not automatically spent.",
  "Gini coefficient":
    "Concentration of nonnegative private wealth, excluding Treasury: 0 means equality, 0.99 is the maximum for 100 people. It says nothing about who is rich or about total wealth. All-zero wealth is assigned Gini 0.",
  "Top 1% share":
    "Wealth of the richest participant divided by total private wealth. Rank is recomputed when metrics are calculated.",
  "Top 10% share":
    "Combined wealth of the richest 10 people divided by total private wealth. A change from 20% to 15% is −5 percentage points.",
  "Bottom 50% share":
    "Combined wealth of the poorest 50 people divided by total private wealth. Shares are defined as zero if total wealth is zero.",
  "Private wealth":
    "Sum of participants’ wealth, excluding Treasury. Gini, shares and circles describe private wealth only. Tax retention lowers this sum without destroying modeled wealth.",
  Treasury:
    "Government holdings accumulated from retained tax revenue. Starts at zero, earns no return, receives no opportunities, and makes no payments in retention mode. It is not a 101st participant.",
  "Total modeled wealth":
    "Private wealth plus Treasury. Transfers, tax collection, relief and redistribution conserve this total; external economic gains and losses can change it.",
  "Top 5% share":
    "Combined private wealth of the richest five people divided by all private wealth. This current group need not match a fixed relief group or pre-tax eligibility.",
  "Tax relief this round":
    "Collection forgone because of the liability discount, after available-funds caps. Each tax is evaluated using the same wealth and base immediately before that tax. This is not a separate simulation without relief or a measure of the whole long-run revenue effect.",
  "Cumulative tax relief":
    "Sum of actual collection forgone at each tax assessment through this checkpoint. It does not include subsequent changes in wealth, later tax bases or opportunity access caused by relief.",
  "Cumulative tax revenue":
    "Actual taxes collected through this checkpoint, after relief and available-funds caps. Retained collections build Treasury; redistributed collections go to participants.",
  "Cumulative redistribution":
    "Actual participant payouts through this checkpoint. Zero in Treasury retention mode; otherwise all current-round tax collections are paid out.",
  "Total wealth":
    "Sum of all 100 participants’ wealth. Transfers and fully redistributed taxes conserve it; external gains and losses can change it.",
  "Mean wealth":
    "Total wealth divided by 100. Large fortunes can raise the mean even if most people do not gain.",
  "Median wealth":
    "The midpoint of the wealth distribution: average wealth of the two middle-ranked people. It differs from the mean.",
  "Top 1% / richest":
    "The richest participant’s share of aggregate wealth, followed by their wealth in euros. This participant can change over time.",
  "Richest participant":
    "Current wealth of the richest person. This measures the amount, not the persistence of a particular person at the top.",
  "At zero wealth":
    "Number of participants with exactly zero wealth at this round. This is a count, not the probability of ever reaching zero.",
  "Reference scenario":
    "Other columns show scenario minus this reference. Positive is not automatically better. A single seed is an illustration, not an estimate across repeated runs.",
  "History metric":
    "Choose the outcome plotted over completed rounds. Lines end at each scenario’s last round; missing rounds are not extrapolated.",
  "Table rounds":
    "Compare current snapshots, which may be at different rounds, or choose one historical round completed by every scenario. Charts of distributions remain current.",
};
