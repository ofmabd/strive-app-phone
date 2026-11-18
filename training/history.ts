import { isCompletedWorkout, parseLocalDate } from "./consistency";
import type { WorkoutSession } from "./types";
export type CompletedSession = Extract<WorkoutSession, { status: "completed" }>;
export function completedHistory(sessions: readonly WorkoutSession[]): CompletedSession[] {
  const seen = new Set<string>();
  return sessions.filter((session): session is CompletedSession => {
    if (session.status !== "completed" || !isCompletedWorkout(session) || seen.has(session.id)) return false;
    seen.add(session.id); return true;
  }).sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
}
export function historySummary(session: CompletedSession) {
  const elapsedMs = Date.parse(session.completedAt) - Date.parse(session.createdAt);
  return {
    exerciseCount: session.exercises.length,
    completedSets: session.exercises.flatMap((item) => item.sets).filter((set) => set.completed).length,
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
  };
}
export function historyDate(day: string): string {
  return parseLocalDate(day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function elapsedLabel(ms: number | null): string {
  if (ms === null) return "Duration unavailable";
  const minutes = Math.floor(ms / 60000);
  return minutes < 1 ? "Elapsed <1 min" : `Elapsed ${minutes} min`;
}
