import type { LocalDate, WeeklyTargetSnapshot, WorkoutSession } from "./types";

export function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected YYYY-MM-DD local date.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Invalid local calendar date.");
  }
  return date;
}
export function localDate(date: Date): LocalDate {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date.");
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekStart(day: LocalDate): LocalDate {
  const date = parseLocalDate(day);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return localDate(date);
}
function previousWeek(monday: LocalDate): LocalDate {
  const date = parseLocalDate(monday);
  date.setDate(date.getDate() - 7);
  return localDate(date);
}
export function isCompletedWorkout(session: WorkoutSession): boolean {
  return session.status === "completed" && session.exercises.some((exercise) =>
    exercise.sets.some((set) => set.completed && Number.isInteger(set.reps) && set.reps! > 0));
}
export function weeklyProgress(
  sessions: readonly WorkoutSession[], snapshots: readonly WeeklyTargetSnapshot[], day: LocalDate,
) {
  const monday = weekStart(day);
  const target = snapshots.find((item) => item.weekStart === monday)?.target ?? null;
  const ids = new Set(sessions.filter((session) => session.status === "completed" &&
    isCompletedWorkout(session) && weekStart(session.completedOn) === monday).map((session) => session.id));
  return { weekStart: monday, completed: ids.size, target, successful: target !== null && ids.size >= target };
}
// The current unfinished week does not break a streak. Include it once its target
// is met; otherwise count backward from last week. A missing snapshot breaks it.
export function consecutiveSuccessfulWeeks(
  sessions: readonly WorkoutSession[], snapshots: readonly WeeklyTargetSnapshot[], today: LocalDate,
): number {
  let monday = weekStart(today);
  if (!weeklyProgress(sessions, snapshots, monday).successful) monday = previousWeek(monday);
  let count = 0;
  while (weeklyProgress(sessions, snapshots, monday).successful) {
    count++;
    monday = previousWeek(monday);
  }
  return count;
}
