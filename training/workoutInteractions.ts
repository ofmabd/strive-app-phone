import type { SessionExercise, WeightUnit, WorkoutSession, WorkoutSet } from "./types";
import { displayWeight, previousExerciseSets } from "./manual";
import { setType } from "./setTypes";
import { timerExercise } from "./restTimer";

export type DeletedSet = { exerciseId: string; index: number; set: WorkoutSet };

export function captureSet(session: WorkoutSession, exerciseId: string, setId: string): DeletedSet {
  const exercise = session.exercises.find((item) => item.id === exerciseId);
  const index = exercise?.sets.findIndex((set) => set.id === setId) ?? -1;
  if (!exercise || index < 0) throw new Error("Set not found.");
  const set = exercise.sets[index];
  return { exerciseId, index, set: { ...set, draft: { ...set.draft } } };
}

export function restoreSet(session: WorkoutSession, deleted: DeletedSet, now: string): WorkoutSession {
  editable(session);
  if (!session.exercises.some((item) => item.id === deleted.exerciseId)) throw new Error("The exercise was removed. This set cannot be restored here.");
  // An accidental second Undo cannot duplicate a set or restart its old timer.
  if (session.exercises.some((item) => item.sets.some((set) => set.id === deleted.set.id))) return session;
  return { ...session, updatedAt: now, exercises: session.exercises.map((item) => {
    if (item.id !== deleted.exerciseId) return item;
    const sets = [...item.sets];
    sets.splice(Math.min(deleted.index, sets.length), 0, { ...deleted.set, draft: { ...deleted.set.draft } });
    return { ...item, sets };
  }) };
}

function editable(session: WorkoutSession) {
  if (session.status !== "active" && session.status !== "draft") throw new Error("Workout is finalized.");
}

// Older manual timers may have no owner. Bind them before changing exercise order.
export function withTimerOwner(session: WorkoutSession): WorkoutSession {
  const owner = timerExercise(session);
  return session.restTimer && owner && !session.restTimer.exerciseId
    ? { ...session, restTimer: { ...session.restTimer, exerciseId: owner.id } } : session;
}

export function reorderExercises(session: WorkoutSession, ids: readonly string[], now: string): WorkoutSession {
  editable(session);
  if (ids.length !== session.exercises.length || new Set(ids).size !== ids.length || ids.some((id) => !session.exercises.some((item) => item.id === id))) {
    throw new Error("The exercise list changed. Reopen reorder to try again.");
  }
  if (ids.every((id, index) => session.exercises[index].id === id)) return session;
  return { ...withTimerOwner(session), updatedAt: now, exercises: ids.map((id) => session.exercises.find((item) => item.id === id)!) };
}

// Match the ordinal within each set type, not a shifted table row. Only completed
// sets from the latest relevant completed workout provide values. Unfinished
// rows retain their position but never provide a reference. Draft strings never do.
export function previousSetReference(sessions: readonly WorkoutSession[], exercise: SessionExercise, setId: string, currentId: string, unit?: WeightUnit) {
  const index = exercise.sets.findIndex((set) => set.id === setId);
  if (index < 0) return null;
  const current = exercise.sets[index];
  const type = setType(current);
  const ordinal = exercise.sets.slice(0, index).filter((set) => setType(set) === type).length;
  const previous = previousExerciseSets(sessions, exercise.exerciseId, currentId, sets => {
    const match = sets.filter(set => setType(set) === type)[ordinal];
    return !!match?.completed && Number.isSafeInteger(match.reps) && match.reps! > 0 &&
      (match.weightKg === null || (Number.isFinite(match.weightKg) && match.weightKg >= 0));
  }).filter((set) => setType(set) === type)[ordinal];
  if (!previous?.completed || previous.reps === null || !Number.isSafeInteger(previous.reps) || previous.reps < 1) return null;
  const weight = previous.weightKg !== null && Number.isFinite(previous.weightKg) && previous.weightKg >= 0
    ? displayWeight(previous.weightKg, unit ?? current.draft.weightUnit) : null;
  return { weight: weight?.split(" ")[0] ?? "", reps: String(previous.reps), unit: unit ?? current.draft.weightUnit };
}
