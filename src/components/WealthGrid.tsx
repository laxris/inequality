import type { SimulationState } from "../simulation/types";

export const currency = (value: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
export const wealthRadius = (wealth: number, total: number) =>
  total > 0 ? 180 * Math.sqrt(wealth / total) : 0;

export function WealthGrid({
  state,
  selected,
  onSelect,
}: {
  state: SimulationState;
  selected: number;
  onSelect: (id: number) => void;
}) {
  return (
    <svg
      className="wealth-grid"
      viewBox="0 0 620 620"
      role="group"
      aria-label="100 participants in fixed grid positions. Circle area represents wealth share."
    >
      <title>Wealth distribution, round {state.round}</title>
      {state.participants.map((participant) => (
        <circle
          key={`dot-${participant.id}`}
          cx={85 + (participant.id % 10) * 50}
          cy={85 + Math.floor(participant.id / 10) * 50}
          r="1.5"
          fill="#b9c5bd"
        />
      ))}
      {[...state.participants]
        .sort((a, b) => b.wealth - a.wealth || a.id - b.id)
        .map((participant) => {
          const ledger = state.ledger.participants[participant.id];
          const delta =
            ledger.transferGains -
            ledger.transferLosses +
            ledger.externalGains -
            ledger.externalLosses -
            ledger.taxesPaid +
            ledger.transfersReceived;
          return (
            <circle
              className="wealth-circle"
              key={participant.id}
              cx={85 + (participant.id % 10) * 50}
              cy={85 + Math.floor(participant.id / 10) * 50}
              r={wealthRadius(participant.wealth, state.metrics.totalWealth)}
              fill={delta > 0 ? "#187863" : delta < 0 ? "#bc674b" : "#68867a"}
              fillOpacity="0.8"
              pointerEvents="none"
            />
          );
        })}
      {state.participants.map((participant) => (
        <g
          key={participant.id}
          role="button"
          tabIndex={0}
          aria-pressed={selected === participant.id}
          aria-label={`Participant ${participant.id + 1}, ${currency(
            participant.wealth
          )}, ${percent(
            state.metrics.totalWealth
              ? participant.wealth / state.metrics.totalWealth
              : 0
          )} of private wealth`}
          onClick={() => onSelect(participant.id)}
          onFocus={() => onSelect(participant.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(participant.id);
            }
          }}
        >
          <rect
            x={62 + (participant.id % 10) * 50}
            y={62 + Math.floor(participant.id / 10) * 50}
            width="46"
            height="46"
            rx="8"
            fill="transparent"
            stroke={selected === participant.id ? "#243e34" : "transparent"}
            strokeWidth="1.5"
          />
        </g>
      ))}
    </svg>
  );
}

export function ParticipantDetails({
  state,
  selected,
}: {
  state: SimulationState;
  selected: number;
}) {
  const participant = state.participants[selected];
  const ledger = state.ledger.participants[selected];
  const change =
    ledger.transferGains -
    ledger.transferLosses +
    ledger.externalGains -
    ledger.externalLosses -
    ledger.taxesPaid +
    ledger.transfersReceived;
  return (
    <div className="participant-detail">
      <div className="detail-heading">
        <h3>Participant {selected + 1}</h3>
        <strong>{currency(participant.wealth)}</strong>
      </div>
      <dl className="ledger">
        <div>
          <dt>Wealth share</dt>
          <dd>
            {percent(
              state.metrics.totalWealth
                ? participant.wealth / state.metrics.totalWealth
                : 0
            )}
          </dd>
        </div>
        <div>
          <dt>Change this round</dt>
          <dd>{currency(change)}</dd>
        </div>
        <div>
          <dt>Transfers gained / lost</dt>
          <dd>
            {currency(ledger.transferGains)} / {currency(ledger.transferLosses)}
          </dd>
        </div>
        <div>
          <dt>External gains / losses</dt>
          <dd>
            {currency(ledger.externalGains)} / {currency(ledger.externalLosses)}
          </dd>
        </div>
        <div>
          <dt>Taxes paid</dt>
          <dd>{currency(ledger.taxesPaid)}</dd>
        </div>
        {ledger.reliefEligible !== undefined && (
          <>
            <div>
              <dt>Relief eligible this tax phase</dt>
              <dd>{ledger.reliefEligible ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Collectible before relief</dt>
              <dd>{currency(ledger.taxBeforeRelief ?? 0)}</dd>
            </div>
            <div>
              <dt>Collection forgone through relief</dt>
              <dd>{currency(ledger.taxRelief ?? 0)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Redistribution received</dt>
          <dd>{currency(ledger.transfersReceived)}</dd>
        </div>
      </dl>
    </div>
  );
}
