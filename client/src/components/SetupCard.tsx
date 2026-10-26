import { BOT_RATINGS, botRatingLabel, type BotRating } from "../../../shared/types";
import type { Mode, Settings } from "../game";

interface Props {
  draft: Settings;
  onChange: (settings: Settings) => void;
  onNewGame: () => void;
}

const MODES: { mode: Mode; label: string }[] = [
  { mode: "bot", label: "Play the bot" },
  { mode: "both", label: "Play both sides" },
  { mode: "learn", label: "Learn openings" },
  { mode: "review", label: "Review a game" },
];

const HELP: Record<Mode, string> = {
  bot: "Bot ratings are estimates on the Chess.com scale. Only your moves are graded.",
  both: "You move both colors and every move is graded. My color sits at the bottom of the board.",
  learn:
    "Step through an opening with → or its book moves, and play your own moves anywhere to explore. Explain any move to learn the idea behind it.",
  review:
    "Load one of your Chess.com games, or paste a game link or PGN. Every move of both sides is graded; My color sits at the bottom of the board.",
};

export function SetupCard({ draft, onChange, onNewGame }: Props) {
  return (
    <section className="card setup">
      <div className="segmented" role="radiogroup" aria-label="Mode">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            role="radio"
            aria-checked={draft.mode === mode}
            className={draft.mode === mode ? "on" : ""}
            onClick={() => onChange({ ...draft, mode })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="setup-row">
        <label>
          My color
          <select
            value={draft.myColor}
            onChange={(e) => onChange({ ...draft, myColor: e.target.value as Settings["myColor"] })}
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>

        {draft.mode === "bot" && (
          <label>
            Bot rating
            <select
              value={String(draft.rating)}
              onChange={(e) => {
                const value = e.target.value;
                onChange({ ...draft, rating: value === "max" ? "max" : (Number(value) as BotRating) });
              }}
            >
              {BOT_RATINGS.map((rating) => (
                <option key={rating} value={String(rating)}>
                  {botRatingLabel(rating)}
                </option>
              ))}
            </select>
          </label>
        )}

        {draft.mode !== "learn" && draft.mode !== "review" && (
          <button className="primary" onClick={onNewGame}>
            New game
          </button>
        )}
      </div>
      <p className="muted small">{HELP[draft.mode]}</p>
    </section>
  );
}
