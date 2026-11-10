import type { Exercise, ExerciseEquipment, MuscleGroup } from "./types";
export const MUSCLES: MuscleGroup[] = ["chest", "back", "shoulders", "quadriceps", "hamstrings", "glutes", "arms", "calves", "core", "full_body"];
export const EXERCISE_EQUIPMENT: ExerciseEquipment[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "resistance_band", "kettlebell"];
export function label(value: string) { return value.replace(/_/g, " "); }
const definitions: [string, string, MuscleGroup, ExerciseEquipment][] = [
  ["barbell-squat", "Barbell squat", "quadriceps", "barbell"],
  ["goblet-squat", "Goblet squat", "quadriceps", "dumbbell"],
  ["leg-press", "Leg press", "quadriceps", "machine"],
  ["romanian-deadlift", "Romanian deadlift", "hamstrings", "barbell"],
  ["hip-thrust", "Hip thrust", "glutes", "barbell"],
  ["bench-press", "Bench press", "chest", "barbell"],
  ["dumbbell-press", "Dumbbell chest press", "chest", "dumbbell"],
  ["push-up", "Push-up", "chest", "bodyweight"],
  ["seated-row", "Seated cable row", "back", "cable"],
  ["lat-pulldown", "Lat pulldown", "back", "machine"],
  ["pull-up", "Pull-up", "back", "bodyweight"],
  ["overhead-press", "Dumbbell overhead press", "shoulders", "dumbbell"],
  ["lateral-raise", "Lateral raise", "shoulders", "dumbbell"],
  ["biceps-curl", "Biceps curl", "arms", "dumbbell"],
  ["triceps-pushdown", "Triceps pushdown", "arms", "cable"],
  ["calf-raise", "Standing calf raise", "calves", "bodyweight"],
  ["crunch", "Crunch", "core", "bodyweight"],
  ["band-row", "Resistance band row", "back", "resistance_band"],
];
const publishedAt = "2026-11-10T00:00:00.000Z";
export const BUILT_IN_EXERCISES: Exercise[] = definitions.map(([id, name, primaryMuscle, equipment]) => ({
  id: `builtin:${id}`, schemaVersion: 1, name, primaryMuscle, equipment, source: "built_in",
  createdAt: publishedAt, updatedAt: publishedAt,
}));
export function exerciseLibrary(saved: readonly Exercise[]): Exercise[] {
  const ids = new Set(BUILT_IN_EXERCISES.map((item) => item.id));
  return [...BUILT_IN_EXERCISES, ...saved.filter((item) => !ids.has(item.id))];
}
