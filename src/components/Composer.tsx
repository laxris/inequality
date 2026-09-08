import { Field, Help, explanations } from "./Help";
import { expectedReturn } from "../simulation/config";
import { opportunity } from "../simulation/presets";
import type {
  Experiment,
  ExternalProcess,
  InvestmentReturns,
} from "../simulation/types";

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1e9,
  step = "any",
  help,
}: {
  label: string;
  help?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <Field label={label} help={help ?? explanations[label]}>
      {(id, descriptionId) => (
        <input
          id={id}
          aria-describedby={descriptionId}
          type="number"
          required
          min={min}
          max={max}
          step={step}
          value={Number.isNaN(value) ? "" : value}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
      )}
    </Field>
  );
}

export function Composer({
  config,
  onChange,
}: {
  config: Experiment;
  onChange: (config: Experiment) => void;
}) {
  const transfer = config.transfers[0];
  const external = config.externalProcesses[0];
  const incomeTax = config.taxes.find((tax) => tax.type === "income-tax");
  const wealthTax = config.taxes.find((tax) => tax.type === "wealth-tax");
  const setExternal = (process: ExternalProcess | undefined) =>
    onChange({ ...config, externalProcesses: process ? [process] : [] });
  const updateReturns = (patch: Partial<InvestmentReturns>) => {
    if (external && external.type !== "independent-shocks")
      setExternal({ ...external, ...patch });
  };
  return (
    <>
      <fieldset>
        <legend>
          <span>01</span> Starting conditions
        </legend>
        <Field
          label="Randomness model"
          help="v1 preserves existing sequential-stream trajectories. v2 uses keyed common random numbers, so adding unrelated processes does not shift other random channels. Changing this setting requires Apply & reset."
        >
          {(id, descriptionId) => (
            <select
              id={id}
              aria-describedby={descriptionId}
              value={config.version}
              onChange={(event) =>
                onChange({
                  ...config,
                  version: Number(event.target.value) as 1 | 2,
                })
              }
            >
              <option value="1">v1 · Original sequential stream</option>
              <option value="2">v2 · Common random numbers</option>
            </select>
          )}
        </Field>
        <NumberField
          label="Wealth per participant (€)"
          value={config.initialWealth}
          onChange={(initialWealth) => onChange({ ...config, initialWealth })}
        />
        <p className="hint">
          100 participants · equal start · no debt. Losses and payments stop at
          zero.
        </p>
      </fieldset>
      <fieldset>
        <legend>
          <span>02</span> Transfers
        </legend>
        <label className="check">
          <input
            type="checkbox"
            checked={!!transfer}
            onChange={(event) =>
              onChange({
                ...config,
                transfers: event.target.checked
                  ? [{ type: "fixed-stake-exchange", stake: 50 }]
                  : [],
              })
            }
          />{" "}
          Fixed-stake fair exchange
        </label>
        {transfer && (
          <NumberField
            label="Stake per pair (€)"
            value={transfer.stake}
            onChange={(stake) =>
              onChange({ ...config, transfers: [{ ...transfer, stake }] })
            }
          />
        )}
        <p className="hint">
          Random pairs, one fair coin each. The payer gives up to the stake.
          Aggregate wealth is conserved.
        </p>
      </fieldset>
      <fieldset>
        <legend>
          <span>03</span> External processes
        </legend>
        <Field label="Process" help={explanations["Process"]}>
          {(id, descriptionId) => (
            <select
              id={id}
              aria-describedby={descriptionId}
              value={external?.type ?? "none"}
              onChange={(event) => {
                const type = event.target.value;
                setExternal(
                  type === "none"
                    ? undefined
                    : type === "independent-shocks"
                    ? { type, amount: 50 }
                    : type === "multiplicative-returns"
                    ? { ...opportunity, type }
                    : { ...opportunity }
                );
              }}
            >
              <option value="none">None</option>
              <option value="independent-shocks">
                Independent external shocks
              </option>
              <option value="capital-opportunity">Capital opportunity</option>
              <option value="multiplicative-returns">
                Universal multiplicative returns
              </option>
            </select>
          )}
        </Field>
        {external?.type === "independent-shocks" && (
          <>
            <NumberField
              label="Independent ± shock (€)"
              value={external.amount}
              onChange={(amount) => setExternal({ ...external, amount })}
            />
            <p className="hint">
              Independent 50/50 gains and losses create or destroy wealth.
              Capping losses at zero introduces upward drift near the floor.
            </p>
          </>
        )}
        {external?.type === "capital-opportunity" && (
          <>
            <NumberField
              label="Events per round"
              value={external.eventsPerRound}
              max={1000}
              step={1}
              onChange={(eventsPerRound) =>
                setExternal({ ...external, eventsPerRound })
              }
            />
            <NumberField
              label="Wealth-access exponent α"
              value={external.opportunityAccessExponent}
              max={5}
              onChange={(opportunityAccessExponent) =>
                setExternal({ ...external, opportunityAccessExponent })
              }
            />
            <NumberField
              label="Baseline access (€)"
              value={external.baselineOpportunityAccess}
              onChange={(baselineOpportunityAccess) =>
                setExternal({ ...external, baselineOpportunityAccess })
              }
            />
            <p className="hint">
              Access ∝ (wealth + baseline)<sup>α</sup>. α = 0 gives equal
              access. Events are drawn with replacement using updated wealth;
              all-zero weights give equal access.
            </p>
            <Field
              label="Capital deployed"
              help={explanations["Capital deployed"]}
            >
              {(id, descriptionId) => (
                <select
                  id={id}
                  aria-describedby={descriptionId}
                  value={external.capitalMode}
                  onChange={(event) =>
                    setExternal({
                      ...external,
                      capitalMode: event.target.value as
                        | "fixed"
                        | "proportional",
                    })
                  }
                >
                  <option value="proportional">
                    Fraction of current wealth
                  </option>
                  <option value="fixed">Fixed amount, capped by wealth</option>
                </select>
              )}
            </Field>
            {external.capitalMode === "fixed" && (
              <NumberField
                label="Fixed capital (€)"
                value={external.fixedCapital}
                onChange={(fixedCapital) =>
                  setExternal({ ...external, fixedCapital })
                }
              />
            )}
          </>
        )}
        {external && external.type !== "independent-shocks" && (
          <>
            {(external.type === "multiplicative-returns" ||
              external.capitalMode === "proportional") && (
              <NumberField
                label="Investment fraction (0–1)"
                value={external.investmentFraction}
                max={1}
                onChange={(investmentFraction) =>
                  updateReturns({ investmentFraction })
                }
              />
            )}
            <div className="field-pair">
              <NumberField
                label="Success probability"
                value={external.successProbability}
                max={1}
                onChange={(successProbability) =>
                  updateReturns({ successProbability })
                }
              />
              <NumberField
                label="Success return"
                value={external.successReturn}
                max={10}
                onChange={(successReturn) => updateReturns({ successReturn })}
              />
            </div>
            <NumberField
              label="Failure return (−1 to 0)"
              value={external.failureReturn}
              min={-1}
              max={0}
              onChange={(failureReturn) => updateReturns({ failureReturn })}
            />
            <p className="formula">
              Expected return on deployed capital:{" "}
              <Help label="Expected return">
                Probability-weighted return: p × success return + (1 − p) ×
                failure return. This is per opportunity on deployed capital, not
                a forecast for total wealth.
              </Help>{" "}
              <strong>
                {Number.isFinite(expectedReturn(external))
                  ? `${(100 * expectedReturn(external)).toFixed(2)}%`
                  : "—"}
              </strong>
            </p>
            <p className="hint">
              Only the return changes wealth; principal is not spent.{" "}
              {external.type === "multiplicative-returns"
                ? "Everyone receives an independent return each round."
                : "Access does not provide capital to invest."}
            </p>
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>
          <span>04</span> Taxes & redistribution
        </legend>
        <label className="check">
          <input
            type="checkbox"
            checked={!!incomeTax}
            onChange={(event) =>
              onChange({
                ...config,
                taxes: [
                  ...(event.target.checked
                    ? [
                        {
                          type: "income-tax" as const,
                          rate: 0.2,
                          taxableFlows: "external-gains" as const,
                        },
                      ]
                    : []),
                  ...config.taxes.filter((t) => t.type !== "income-tax"),
                ],
              })
            }
          />{" "}
          Income tax
        </label>
        {incomeTax && (
          <>
            <NumberField
              label="Income tax rate per round"
              value={incomeTax.rate}
              max={1}
              onChange={(rate) =>
                onChange({
                  ...config,
                  taxes: config.taxes.map((t) =>
                    t === incomeTax ? { ...t, rate } : t
                  ),
                })
              }
            />
            <Field
              label="Taxable gross gains"
              help={explanations["Taxable gross gains"]}
            >
              {(id, descriptionId) => (
                <select
                  id={id}
                  aria-describedby={descriptionId}
                  value={incomeTax.taxableFlows}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      taxes: config.taxes.map((t) =>
                        t === incomeTax
                          ? {
                              ...t,
                              taxableFlows: event.target
                                .value as typeof incomeTax.taxableFlows,
                            }
                          : t
                      ),
                    })
                  }
                >
                  <option value="external-gains">External gains only</option>
                  <option value="transfer-gains">Transfer gains only</option>
                  <option value="all-gains">External + transfer gains</option>
                </select>
              )}
            </Field>
            <p className="hint">
              Losses are not deducted. Collection is capped by available wealth.
            </p>
          </>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={!!wealthTax}
            onChange={(event) =>
              onChange({
                ...config,
                taxes: [
                  ...config.taxes.filter((t) => t.type !== "wealth-tax"),
                  ...(event.target.checked
                    ? [
                        {
                          type: "wealth-tax" as const,
                          rate: 0.01,
                          exemption: 0,
                        },
                      ]
                    : []),
                ],
              })
            }
          />{" "}
          Wealth tax
        </label>
        {wealthTax && (
          <div className="field-pair">
            <NumberField
              label="Rate per round"
              value={wealthTax.rate}
              max={1}
              onChange={(rate) =>
                onChange({
                  ...config,
                  taxes: config.taxes.map((t) =>
                    t === wealthTax ? { ...t, rate } : t
                  ),
                })
              }
            />
            <NumberField
              label="Exemption (€)"
              value={wealthTax.exemption}
              onChange={(exemption) =>
                onChange({
                  ...config,
                  taxes: config.taxes.map((t) =>
                    t === wealthTax ? { ...t, exemption } : t
                  ),
                })
              }
            />
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={!!config.taxRelief}
            onChange={(event) =>
              onChange({
                ...config,
                taxRelief: event.target.checked
                  ? {
                      eligibility: "wealthiest",
                      fraction: 0.05,
                      discount: 0.8,
                      affectedTax: "wealth-tax",
                    }
                  : undefined,
              })
            }
          />{" "}
          Tax relief / loophole
        </label>
        {config.taxRelief && (
          <>
            <Field
              label="Relief eligibility"
              help="Currently wealthiest ranks people after economic processes but before any taxes, then freezes membership for the tax phase. Fixed group always uses the lowest participant IDs. Ties at equal wealth favor lower IDs in either mode; this is an arbitrary initial advantage."
            >
              {(id, desc) => (
                <select
                  id={id}
                  aria-describedby={desc}
                  value={config.taxRelief!.eligibility}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      taxRelief: {
                        ...config.taxRelief!,
                        eligibility: event.target.value as
                          | "wealthiest"
                          | "fixed",
                      },
                    })
                  }
                >
                  <option value="wealthiest">
                    Currently wealthiest fraction
                  </option>
                  <option value="fixed">Fixed participant group</option>
                </select>
              )}
            </Field>
            <NumberField
              label="Eligible fraction (0.01–1)"
              value={config.taxRelief.fraction}
              min={0.01}
              max={1}
              help="0.05 selects 5 of 100 people. Eligible count rounds up, with exact percentage boundaries preserved. Fixed mode uses participants 1 through this count; current-wealth mode reranks each round."
              onChange={(fraction) =>
                onChange({
                  ...config,
                  taxRelief: { ...config.taxRelief!, fraction },
                })
              }
            />
            <NumberField
              label="Tax liability discount (0–1)"
              value={config.taxRelief.discount}
              max={1}
              help="0.8 reduces eligible tax liability by 80%: a 20% statutory rate becomes 4%, before the available-funds cap. Relief stays with the participant; it is not created or paid from Treasury. Zero gives no discount; 1 gives full relief."
              onChange={(discount) =>
                onChange({
                  ...config,
                  taxRelief: { ...config.taxRelief!, discount },
                })
              }
            />
            <Field
              label="Relief applies to"
              help="Discount only the selected taxes. The income tax still uses its configured gross-gain base. If the selected tax is disabled, relief collects and forgives nothing. Eligibility stays frozen across both taxes."
            >
              {(id, desc) => (
                <select
                  id={id}
                  aria-describedby={desc}
                  value={config.taxRelief!.affectedTax}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      taxRelief: {
                        ...config.taxRelief!,
                        affectedTax: event.target.value as
                          | "income-tax"
                          | "wealth-tax"
                          | "all",
                      },
                    })
                  }
                >
                  <option value="wealth-tax">Wealth tax</option>
                  <option value="income-tax">Income tax</option>
                  <option value="all">Both taxes</option>
                </select>
              )}
            </Field>
          </>
        )}
        <Field
          label="Redistribute collected taxes to"
          help={explanations["Redistribute collected taxes to"]}
        >
          {(id, descriptionId) => (
            <select
              id={id}
              aria-describedby={descriptionId}
              value={config.redistribution.type}
              onChange={(event) =>
                onChange({
                  ...config,
                  redistribution:
                    event.target.value === "bottom"
                      ? { type: "bottom", fraction: 0.2 }
                      : { type: event.target.value as "universal" | "retain" },
                })
              }
            >
              <option value="retain">
                Retain in Treasury (no redistribution)
              </option>
              <option value="universal">Everyone, equally</option>
              <option value="bottom">Poorest fraction, equally</option>
            </select>
          )}
        </Field>
        {config.redistribution.type === "bottom" && (
          <NumberField
            label="Recipient fraction (0.01–1)"
            value={config.redistribution.fraction}
            min={0.01}
            max={1}
            onChange={(fraction) =>
              onChange({
                ...config,
                redistribution: { type: "bottom", fraction },
              })
            }
          />
        )}
        <p className="hint">
          Income tax → wealth tax → Treasury retention or current-revenue
          redistribution. Poorest participants are ranked after taxes; ties use
          participant ID. Recipient count rounds up.
        </p>
      </fieldset>
    </>
  );
}
