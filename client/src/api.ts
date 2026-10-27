import type {
  BotMoveResponse,
  BotRating,
  CoachReply,
  Explanation,
  FollowUp,
  MoveGrade,
  OpeningContext,
  Perspective,
  PositionEval,
  SessionResponse,
  StatusResponse,
} from "../../shared/types";

/** Fired on `window` when the server says the session is gone, so the app shows the sign-in screen. */
export const SIGNED_OUT_EVENT = "chessbuddy:signed-out";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  me: () => request<SessionResponse>("/api/auth/me"),
  login: (username: string, password: string) => request<SessionResponse>("/api/auth/login", { username, password }),
  logout: () => request<{ ok: true }>("/api/auth/logout", {}),
  status: () => request<StatusResponse>("/api/status"),
  botMove: (fen: string, rating: BotRating) => request<BotMoveResponse>("/api/bot-move", { fen, rating }),
  /** With nextGraded, the next move will be graded too, so the server searches the position between them once. */
  grade: (fen: string, uci: string, nextGraded = false) => request<MoveGrade>("/api/grade", { fen, uci, nextGraded }),
  evaluate: (fen: string) => request<PositionEval>("/api/eval", { fen }),
  explain: (grade: MoveGrade, history: string[], model: string, perspective: Perspective, opening?: OpeningContext) =>
    request<Explanation>("/api/explain", { grade, history, model, perspective, opening }),
  /**
   * Asks about a move (its grade), after its explanation or without one, or about a position no
   * move has led to (fen), such as the start of the game.
   */
  ask: (body: {
    grade?: MoveGrade;
    fen?: string;
    history: string[];
    model: string;
    perspective: Perspective;
    explanation?: { summary: string; steps: string[]; lesson: string };
    thread: FollowUp[];
    question: string;
    opening?: OpeningContext;
  }) => request<CoachReply>("/api/ask", body),
};
