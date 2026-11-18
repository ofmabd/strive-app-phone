import type { Exercise, TrainingData, WorkoutSession } from "./types";
import { exerciseLibrary } from "./catalog";
import { completedHistory, historySummary } from "./history";
export function moveExercise(session: WorkoutSession, id: string, direction: -1 | 1, now: string): WorkoutSession {
  if (session.status !== "active" && session.status !== "draft") throw new Error("Workout is finalized.");
  const index = session.exercises.findIndex((item) => item.id === id); const next = index + direction;
  if (index < 0 || next < 0 || next >= session.exercises.length) return session;
  const exercises = [...session.exercises];
  [exercises[index], exercises[next]] = [exercises[next], exercises[index]];
  return { ...session, exercises, updatedAt: now };
}
export function completionSummary(session: WorkoutSession) {
  const completed = completedHistory([session])[0];
  if (!completed) throw new Error("No verified completed workout.");
  const weighted = completed.exercises.flatMap((item) => item.sets).filter((set) => set.completed && set.weightKg !== null && set.reps !== null);
  const volumeKg = weighted.reduce((sum, set) => sum + set.weightKg! * set.reps!, 0);
  return { ...historySummary(completed), completedExercises: completed.exercises.filter((item) => item.sets.some((set) => set.completed)).length,
    volumeKg: weighted.length && Number.isFinite(volumeKg) ? volumeKg : null };
}
export function pickerSections(data: TrainingData, query: string): { title: string; exercises: Exercise[] }[] {
  const choices = exerciseLibrary(data.exercises).filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const used = new Set<string>();
  const recent = [...(data.exercisePreferences?.recentIds ?? []), ...[...data.sessions].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).flatMap((session) => session.exercises.map((item) => item.exerciseId))];
  const take = (ids: string[], limit = Infinity) => ids.flatMap((id) => {
    const exercise = choices.find((item) => item.id === id);
    if (!exercise || used.has(id) || limit-- <= 0) return [];
    used.add(id); return [exercise];
  });
  const favorites = take(data.exercisePreferences?.favoriteIds ?? []);
  const recents = take(recent, 8);
  return [{title:"Favorites",exercises:favorites},{title:"Recently Used",exercises:recents},
    {title:"All Exercises",exercises:choices.filter((item) => !used.has(item.id))}];
}
