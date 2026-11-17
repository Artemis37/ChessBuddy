import { BOT_RATINGS, botRatingLabel, type BotRating } from "../../../shared/types";
import { colorName, type Mode, type Settings } from "../game";

interface Props {
  draft: Settings;
  onChange: (settings: Settings) => void;
  onNewGame: () => void;
}

const MODES: { mode: Mode; label: string }[] = [
  { mode: "bot", label: "Play the bot" },
  { mode: "both", label: "Play both sides" },
  { mode: "analyze", label: "Analyze" },
  { mode: "setup", label: "Set up a position" },
];

export function modeLabel(mode: Mode): string {
  return MODES.find((m) => m.mode === mode)!.label;
}

const HELP: Record<Mode, string> = {
  bot: "Bot ratings are estimates on the Chess.com scale. Only your moves are graded. Step back to any of your turns and play another move to take it back; the bot answers from there.",
  both: "You move both colors and every move is graded. Step back to any move and play from there to try another. My color sits at the bottom of the board.",
  analyze:
    "Every move is graded, book moves included. Play either side from any point to try another line. With a game loaded, Openings studies its opening and Review brings the game back.",
  setup:
    "Drag pieces onto the board from the Position card, or off the board to take them away, at any point of the game. Each edit is a step in the move list you can go back past. Without the bot you play both sides and every move is graded.",
};

/** The modes, on the right of the board next to the move list. */
export function ModePicker({ draft, onChange }: Omit<Props, "onNewGame">) {
  return (
    <section className="card mode-card">
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
    </section>
  );
}

/** The mode's settings: your color, the bot's rating and New game. */
export function SetupCard({ draft, onChange, onNewGame }: Props) {
  return (
    <section className="card setup">
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

        {draft.mode === "setup" && (
          <label>
            Bot
            <select value={draft.vsBot ? "on" : "off"} onChange={(e) => onChange({ ...draft, vsBot: e.target.value === "on" })}>
              <option value="off">Off: I play both</option>
              <option value="on">Plays {colorName(draft.myColor === "w" ? "b" : "w")}</option>
            </select>
          </label>
        )}

        {(draft.mode === "bot" || (draft.mode === "setup" && draft.vsBot)) && (
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

        {(draft.mode === "bot" || draft.mode === "both") && (
          <button className="primary" onClick={onNewGame}>
            New game
          </button>
        )}
      </div>
      <p className="muted small">{HELP[draft.mode]}</p>
    </section>
  );
}
