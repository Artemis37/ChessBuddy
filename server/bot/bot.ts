import type { BotRating } from "../../shared/types";
import type { Analyzer } from "../analysis/grade";
import { chooseBotMove } from "./chooseMove";

const MAX_STRENGTH_MOVETIME_MS = 1500;

export interface BotEngine extends Analyzer {
  bestMove(fen: string, movetimeMs: number): Promise<string | null>;
  warmUp(): Promise<void>;
}

/** Plays the bot's moves on its own engine connection, at a chosen rating or at full strength. */
export class Bot {
  constructor(private readonly engine: BotEngine) {}

  move(fen: string, rating: BotRating): Promise<string | null> {
    if (rating === "max") return this.engine.bestMove(fen, MAX_STRENGTH_MOVETIME_MS);
    return chooseBotMove(this.engine, fen, rating);
  }

  warmUp(): Promise<void> {
    return this.engine.warmUp();
  }
}
