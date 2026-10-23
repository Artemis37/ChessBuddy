import { BOT_RATINGS, botRatingLabel, type BotRating } from "../../../shared/types";
import type { Settings } from "../game";

interface Props {
  draft: Settings;
  onChange: (settings: Settings) => void;
  onNewGame: () => void;
}

export function SetupCard({ draft, onChange, onNewGame }: Props) {
  return (
    <section className="card setup">
      <div className="segmented" role="radiogroup" aria-label="Mode">
        <button
          role="radio"
          aria-checked={draft.mode === "bot"}
          className={draft.mode === "bot" ? "on" : ""}
          onClick={() => onChange({ ...draft, mode: "bot" })}
        >
          Play the bot
        </button>
        <button
          role="radio"
          aria-checked={draft.mode === "both"}
          className={draft.mode === "both" ? "on" : ""}
          onClick={() => onChange({ ...draft, mode: "both" })}
        >
          Play both sides
        </button>
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

        <button className="primary" onClick={onNewGame}>
          New game
        </button>
      </div>
      <p className="muted small">
        {draft.mode === "bot"
          ? "Bot ratings are estimates on the Chess.com scale. Only your moves are graded."
          : "You move both colors and every move is graded. My color sits at the bottom of the board."}
      </p>
    </section>
  );
}
