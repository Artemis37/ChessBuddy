import type {
  BotMoveResponse,
  BotRating,
  Explanation,
  MoveGrade,
  Perspective,
  PositionEval,
  StatusResponse,
} from "../../shared/types";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  status: () => request<StatusResponse>("/api/status"),
  botMove: (fen: string, rating: BotRating) => request<BotMoveResponse>("/api/bot-move", { fen, rating }),
  grade: (fen: string, uci: string) => request<MoveGrade>("/api/grade", { fen, uci }),
  evaluate: (fen: string) => request<PositionEval>("/api/eval", { fen }),
  explain: (grade: MoveGrade, history: string[], model: string, perspective: Perspective) =>
    request<Explanation>("/api/explain", { grade, history, model, perspective }),
};
