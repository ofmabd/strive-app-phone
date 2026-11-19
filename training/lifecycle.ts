import type { WorkoutSession } from "./types";

export function isUnfinished(session: WorkoutSession): boolean {
  return session.status === "active" || session.status === "draft";
}

// Status alone is not evidence that logging started. Keep untouched plans and
// empty legacy drafts available for review, without advertising an active workout.
export function hasWorkoutProgress(session: WorkoutSession): boolean {
  return isUnfinished(session) && (!!session.restTimer || session.exercises.some(exercise =>
    exercise.restSeconds !== undefined || exercise.sets.length > 1 || exercise.sets.some(set =>
      set.completed || set.draft.weight.trim() !== "" || set.draft.reps.trim() !== "" ||
      (set.type !== undefined && set.type !== "normal"))));
}

export function unfinishedWorkout(sessions: readonly WorkoutSession[]) {
  const session = sessions.find(isUnfinished);
  return session ? { session, kind: hasWorkoutProgress(session) ? "resume" as const : "review" as const } : null;
}
