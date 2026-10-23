import { barFill, barLabel, whiteIsAhead } from "../../../shared/evaluation";
import type { Color, PositionEval } from "../../../shared/types";

/** Vertical evaluation bar beside the board; White's share grows from White's side. */
export function EvalBar({ evaluation, orientation }: { evaluation: PositionEval | null; orientation: Color }) {
  const fill = evaluation ? barFill(evaluation) : 50;
  const whiteAhead = evaluation ? whiteIsAhead(evaluation) : true;
  return (
    <div
      className={`eval-bar ${orientation === "w" ? "" : "flipped"} ${evaluation ? "" : "pending"}`}
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill)}
      aria-valuetext={evaluation ? `${whiteAhead ? "White" : "Black"} ${barLabel(evaluation)}` : "Evaluating"}
    >
      <div className="eval-white" style={{ height: `${fill}%` }} />
      {evaluation && <span className={`eval-label ${whiteAhead ? "on-white" : "on-black"}`}>{barLabel(evaluation)}</span>}
    </div>
  );
}
