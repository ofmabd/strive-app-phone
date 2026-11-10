import { localDate } from "./consistency";
import { automaticRest, cancelSetRest, clearRestTimer } from "./restTimer";
import { DEFAULT_TIMER } from "./types";
import type { Exercise, ExerciseEquipment, MuscleGroup, ReadinessSnapshot, TrainingProfile, WeeklyTarget, WeightUnit, WorkoutSession, WorkoutSet } from "./types";
let sequence = 0;
export function newId(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${(++sequence).toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}
function metadata(id: string, now: string) { return { id, schemaVersion: 1 as const, createdAt: now, updatedAt: now }; }
export function manualProfile(target: WeeklyTarget, now: string): TrainingProfile {
  return { ...metadata(newId("profile"), now), weeklyTarget: target, preferredWeightUnit: "kg", timer: { ...DEFAULT_TIMER }, setupStatus: "skipped" };
}
export function customExercise(name: string, primaryMuscle: MuscleGroup, equipment: ExerciseEquipment, now: string): Exercise {
  if (!name.trim()) throw new Error("Enter an exercise name.");
  return { ...metadata(newId("custom"), now), source: "custom", name: name.trim(), primaryMuscle, equipment };
}
export function newSet(unit: WeightUnit, now: string): WorkoutSet {
  return { ...metadata(newId("set"), now), completed: false, reps: null, weightKg: null, draft: { reps: "", weight: "", weightUnit: unit } };
}
export function createManualSession(name: string, exercises: readonly Exercise[], profile: TrainingProfile, readiness: ReadinessSnapshot, now: string): WorkoutSession {
  if (!exercises.length) throw new Error("Choose at least one exercise.");
  if (new Set(exercises.map((item) => item.id)).size !== exercises.length) throw new Error("Exercise already selected.");
  return {
    ...metadata(newId("session"), now), status: "active", source: "manual", name: name.trim() || "Manual workout",
    startedOn: localDate(new Date(now)), exercises: exercises.map((item) => ({ id: newId("movement"), exerciseId: item.id, name: item.name, sets: [newSet(profile.preferredWeightUnit, now)] })),
    readiness, timer: { ...profile.timer }, adjustments: [],
  };
}
function editable(session: WorkoutSession) {
  if (session.status !== "active" && session.status !== "draft") throw new Error("This workout is already finalized.");
}
function changeSet(session: WorkoutSession, movementId: string, setId: string, now: string, change: (set: WorkoutSet) => WorkoutSet): WorkoutSession {
  editable(session);
  let found = false;
  const exercises = session.exercises.map((movement) => movement.id !== movementId ? movement : { ...movement, sets: movement.sets.map((set) => {
    if (set.id !== setId) return set;
    found = true; return change(set);
  }) });
  if (!found) throw new Error("Set not found.");
  return { ...session, exercises, updatedAt: now };
}
export function editSet(session: WorkoutSession, movementId: string, setId: string, field: "reps" | "weight", text: string, now: string): WorkoutSession {
  return cancelSetRest(changeSet(session, movementId, setId, now, (set) => ({ ...set, updatedAt: now, completed: false, reps: null, weightKg: null, draft: { ...set.draft, [field]: text } })), setId);
}
export function toggleSet(session: WorkoutSession, movementId: string, setId: string, now: string): WorkoutSession {
  const next = changeSet(session, movementId, setId, now, (set) => {
    if (set.completed) return { ...set, completed: false, updatedAt: now };
    if (!/^\d+$/.test(set.draft.reps.trim())) throw new Error("Enter a whole number of reps greater than zero.");
    const reps = Number(set.draft.reps.trim());
    if (!Number.isSafeInteger(reps) || reps < 1) throw new Error("Enter a whole number of reps greater than zero.");
    const weight = set.draft.weight.trim().replace(",", ".");
    if (weight !== "" && !/^\d+(\.\d+)?$/.test(weight)) throw new Error("Enter a complete non-negative weight, or leave it blank for unweighted sets.");
    const weightKg = weight === "" ? null : Number(weight) * (set.draft.weightUnit === "lb" ? 0.45359237 : 1);
    if (weightKg !== null && !Number.isFinite(weightKg)) throw new Error("Weight is too large.");
    return { ...set, completed: true, reps, weightKg, updatedAt: now };
  });
  const completed = next.exercises.find((item) => item.id === movementId)?.sets.find((set) => set.id === setId)?.completed;
  return completed ? automaticRest(next, setId, now) : cancelSetRest(next, setId);
}
export function addExercise(session: WorkoutSession, exercise: Exercise, unit: WeightUnit, now: string): WorkoutSession {
  editable(session);
  if (session.exercises.some((item) => item.exerciseId === exercise.id)) return session;
  return { ...session, updatedAt: now, exercises: [...session.exercises, { id: newId("movement"), exerciseId: exercise.id, name: exercise.name, sets: [newSet(unit, now)] }] };
}
export function removeExercise(session: WorkoutSession, movementId: string, now: string): WorkoutSession {
  editable(session);
  const removed = session.exercises.find((item) => item.id === movementId);
  const next = { ...session, updatedAt: now, exercises: session.exercises.filter((item) => item.id !== movementId) };
  return removed?.sets.some((set) => set.id === session.restTimer?.triggerSetId) ? clearRestTimer(next) : next;
}
export function addSet(session: WorkoutSession, movementId: string, unit: WeightUnit, now: string): WorkoutSession {
  editable(session);
  return { ...session, updatedAt: now, exercises: session.exercises.map((item) => item.id === movementId ? { ...item, sets: [...item.sets, newSet(unit, now)] } : item) };
}
export function removeSet(session: WorkoutSession, movementId: string, setId: string, now: string): WorkoutSession {
  editable(session);
  return cancelSetRest({ ...session, updatedAt: now, exercises: session.exercises.map((item) => item.id === movementId ? { ...item, sets: item.sets.filter((set) => set.id !== setId) } : item) }, setId);
}
export function finishSummary(session: WorkoutSession) {
  const sets = session.exercises.flatMap((item) => item.sets);
  const completed = sets.filter((set) => set.completed).length;
  return { completed, unfinished: sets.length - completed, canFinish: completed > 0 };
}
export function finishWorkout(session: WorkoutSession, now: string): WorkoutSession {
  if (session.status === "completed") return session;
  editable(session);
  const summary = finishSummary(session);
  if (!summary.canFinish) throw new Error("Complete at least one set before finishing.");
  return clearRestTimer({ ...session, status: "completed", updatedAt: now, completedAt: now, completedOn: localDate(new Date(now)), finishedEarly: summary.unfinished > 0 });
}
export function previousPerformance(sessions: readonly WorkoutSession[], exerciseId: string, currentId: string): WorkoutSet[] {
  const previous = sessions.filter((session) => session.id !== currentId && session.status === "completed" &&
    session.exercises.some((item) => item.exerciseId === exerciseId && item.sets.some((set) => set.completed)))
    .sort((a, b) => (b.status === "completed" ? b.completedAt : "").localeCompare(a.status === "completed" ? a.completedAt : ""))[0];
  return previous?.exercises.filter((item) => item.exerciseId === exerciseId).flatMap((item) => item.sets.filter((set) => set.completed)) ?? [];
}
export function displayWeight(weightKg: number | null, unit: WeightUnit): string {
  return weightKg === null ? "unweighted" : `${Number((weightKg / (unit === "lb" ? 0.45359237 : 1)).toFixed(2))} ${unit}`;
}
