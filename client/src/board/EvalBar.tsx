import { barFill, barLabel, whiteIsAhead } from "../../../shared/evaluation";
import type { Color, PositionEval } from "../../../shared/types";

/**
 * Evaluation bar beside the board; White's share grows from White's side. On a phone it lies
 * above the board (`horizontal`), White's share growing from the left, or from the right with
 * Black at the bottom.
 */
export function EvalBar({
  evaluation,
  orientation,
  horizontal = false,
}: {
  evaluation: PositionEval | null;
  orientation: Color;
  horizontal?: boolean;
}) {
  const fill = evaluation ? barFill(evaluation) : 50;
  const whiteAhead = evaluation ? whiteIsAhead(evaluation) : true;
  return (
    <div
      className={`eval-bar ${orientation === "w" ? "" : "flipped"} ${evaluation ? "" : "pending"}${horizontal ? " horizontal" : ""}`}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill)}
      aria-valuetext={evaluation ? `${whiteAhead ? "White" : "Black"} ${barLabel(evaluation)}` : "Evaluating"}
    >
      <div className="eval-white" style={horizontal ? { width: `${fill}%` } : { height: `${fill}%` }} />
      {evaluation && <span className={`eval-label ${whiteAhead ? "on-white" : "on-black"}`}>{barLabel(evaluation)}</span>}
    </div>
  );
}
