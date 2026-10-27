import type { Classification } from "../../../shared/types";

/**
 * Chess.com's icon for a move's grade, or for a book move: its own SVGs, kept in
 * client/public/grades. Decorative; the caller gives the grade's name to screen readers.
 */
export function GradeIcon({ kind, className = "grade-icon" }: { kind: Classification | "book"; className?: string }) {
  return <img className={className} src={`/grades/${kind}.svg`} alt="" draggable={false} />;
}
