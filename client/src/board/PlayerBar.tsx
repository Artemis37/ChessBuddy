import type { PieceSymbol } from "chess.js";
import type { Color } from "../../../shared/types";
import { pieceUrl } from "./Board";

interface Props {
  name: string;
  detail?: string;
  color: Color;
  /** Opponent pieces this side has captured, in display order. */
  captured: PieceSymbol[];
  /** Material lead in pawns; shown only when positive. */
  lead: number;
  thinking?: boolean;
}

/** The strip above or below the board: avatar, name, captured pieces and material lead. */
export function PlayerBar({ name, detail, color, captured, lead, thinking }: Props) {
  const capturedColor: Color = color === "w" ? "b" : "w";
  const groups: PieceSymbol[][] = [];
  for (const piece of captured) {
    const last = groups[groups.length - 1];
    if (last && last[0] === piece) last.push(piece);
    else groups.push([piece]);
  }

  return (
    <div className="player-bar">
      <div className={`avatar ${color}`} aria-hidden>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="4.5" />
          <path d="M3.5 22c0-4.7 3.8-8 8.5-8s8.5 3.3 8.5 8z" />
        </svg>
      </div>
      <div className="player-info">
        <div className="player-name">
          {name}
          {detail && <span className="player-detail">{detail}</span>}
          {thinking && <span className="thinking">thinking…</span>}
        </div>
        <div className="captures" aria-label={`${captured.length} pieces captured`}>
          {groups.map((group, i) => (
            <span className="capture-group" key={i}>
              {group.map((piece, j) => (
                <img key={j} src={pieceUrl(capturedColor, piece)} alt="" draggable={false} />
              ))}
            </span>
          ))}
          {lead > 0 && <span className="lead">+{lead}</span>}
        </div>
      </div>
    </div>
  );
}
