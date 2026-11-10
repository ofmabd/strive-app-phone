import { finishWorkout } from "./manual";
import { MUSCLES, EXERCISE_EQUIPMENT, BUILT_IN_EXERCISES } from "./catalog";
import { isCompletedWorkout, parseLocalDate, weekStart } from "./consistency";
import type { Exercise, TrainingData, TrainingProfile, RecordMetadata, WorkoutSession } from "./types";

export const TRAINING_KEY = "strive:training:data:v1";
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid training data; stored data was not reset.");
}
function record(value: unknown): asserts value is Record<string, unknown> {
  check(typeof value === "object" && value !== null && !Array.isArray(value));
}
function text(value: unknown): asserts value is string { check(typeof value === "string" && value.trim().length > 0); }
function instant(value: unknown): asserts value is string {
  text(value);
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value));
  check(Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
}
function day(value: unknown): asserts value is string { text(value); parseLocalDate(value); }
function integer(value: unknown, min = 1) { check(Number.isSafeInteger(value) && (value as number) >= min); }
function weight(value: unknown) { check(value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)); }
function unit(value: unknown) { check(value === "kg" || value === "lb"); }
function target(value: unknown) { integer(value); check((value as number) <= 7); }
function metadata(value: unknown): asserts value is Record<string, unknown> & RecordMetadata {
  record(value); text(value.id); check(value.schemaVersion === 1);
  instant(value.createdAt); instant(value.updatedAt); check(value.createdAt <= value.updatedAt);
}
function timer(value: unknown) {
  record(value); check(["automatic", "manual", "off"].includes(String(value.mode))); integer(value.durationSeconds);
}
function list(value: unknown): asserts value is unknown[] { check(Array.isArray(value)); }
function unique(values: unknown[]) { check(new Set(values).size === values.length); }
function profile(value: unknown) {
  metadata(value); target(value.weeklyTarget); unit(value.preferredWeightUnit); timer(value.timer);
  check(["skipped", "in_progress", "complete"].includes(String(value.setupStatus)));
  if (value.primaryGoal !== undefined) check(["build_muscle", "increase_strength", "improve_endurance", "general_fitness"].includes(String(value.primaryGoal)));
  if (value.experience !== undefined) check(["beginner", "intermediate", "advanced"].includes(String(value.experience)));
  if (value.equipment !== undefined) check(["full_gym", "home_equipment", "bodyweight"].includes(String(value.equipment)));
}
function exercise(value: unknown) {
  metadata(value); text(value.name); check(value.source === "built_in" || value.source === "custom");
  if (value.primaryMuscle !== undefined) check(MUSCLES.some((item) => item === value.primaryMuscle));
  if (value.equipment !== undefined) check(EXERCISE_EQUIPMENT.some((item) => item === value.equipment));
}
function session(value: unknown) {
  metadata(value); text(value.name); day(value.startedOn); timer(value.timer);
  check(value.source === "manual" || value.source === "suggested");
  check(["draft", "active", "completed", "discarded"].includes(String(value.status)));
  record(value.readiness);
  if (value.readiness.status === "available") {
    check(typeof value.readiness.score === "number" && Number.isFinite(value.readiness.score) && value.readiness.score >= 0 && value.readiness.score <= 100);
    day(value.readiness.localDate);
  } else { check(value.readiness.status === "missing" && !("score" in value.readiness)); }
  list(value.exercises);
  const exerciseIds: string[] = [];
  const setIds: string[] = [];
  for (const entry of value.exercises) {
    record(entry); text(entry.id); exerciseIds.push(entry.id); text(entry.exerciseId); text(entry.name); list(entry.sets);
    for (const set of entry.sets) {
      metadata(set); setIds.push(set.id); check(typeof set.completed === "boolean");
      if (set.reps !== null) integer(set.reps);
      weight(set.weightKg);
      if (set.completed) integer(set.reps);
      record(set.draft); check(typeof set.draft.reps === "string" && typeof set.draft.weight === "string"); unit(set.draft.weightUnit);
    }
  }
  unique(exerciseIds); unique(setIds);
  list(value.adjustments);
  const adjustmentIds: string[] = [];
  for (const adjustment of value.adjustments) {
    metadata(adjustment); adjustmentIds.push(adjustment.id);
    check(adjustment.reason === "progression" || adjustment.reason === "readiness");
    list(adjustment.changes); check(adjustment.changes.length > 0);
    for (const change of adjustment.changes) {
      record(change); text(change.sessionExerciseId); check(exerciseIds.includes(change.sessionExerciseId));
      integer(change.sets); integer(change.reps); weight(change.weightKg);
    }
    if (adjustment.status === "approved") {
      instant(adjustment.approvedAt); check(adjustment.approvedAt >= adjustment.createdAt && adjustment.approvedAt <= adjustment.updatedAt);
      check(!("rejectedAt" in adjustment));
    } else if (adjustment.status === "rejected") {
      instant(adjustment.rejectedAt); check(adjustment.rejectedAt >= adjustment.createdAt && adjustment.rejectedAt <= adjustment.updatedAt);
      check(!("approvedAt" in adjustment));
    } else { check(adjustment.status === "proposed" && !("approvedAt" in adjustment) && !("rejectedAt" in adjustment)); }
  }
  unique(adjustmentIds);
  if (value.status === "completed") {
    instant(value.completedAt); day(value.completedOn); check(typeof value.finishedEarly === "boolean");
    check(value.completedAt >= value.createdAt && value.completedAt <= value.updatedAt && value.completedOn >= value.startedOn);
    check(isCompletedWorkout(value as unknown as WorkoutSession));
  } else { check(!("completedAt" in value) && !("completedOn" in value) && !("finishedEarly" in value)); }
  if (value.status === "discarded") {
    instant(value.discardedAt); check(value.discardedAt >= value.createdAt && value.discardedAt <= value.updatedAt);
  } else { check(!("discardedAt" in value)); }
}
export function validateTrainingData(value: unknown): TrainingData {
  record(value); check(value.schemaVersion === 1);
  if (value.profile !== null) profile(value.profile);
  list(value.exercises); value.exercises.forEach(exercise);
  list(value.sessions); value.sessions.forEach(session);
  list(value.weeklyTargets);
  for (const snapshot of value.weeklyTargets) {
    record(snapshot); day(snapshot.weekStart); check(weekStart(snapshot.weekStart) === snapshot.weekStart);
    target(snapshot.target); instant(snapshot.capturedAt);
  }
  const data = value as unknown as TrainingData;
  unique(data.exercises.map((item) => item.id)); unique(data.sessions.map((item) => item.id));
  unique(data.weeklyTargets.map((item) => item.weekStart));
  check(data.sessions.filter((item) => item.status === "draft" || item.status === "active").length <= 1);
  for (const item of data.sessions) {
    const requiredWeeks = [weekStart(item.startedOn)];
    if (item.status === "completed") requiredWeeks.push(weekStart(item.completedOn));
    check(requiredWeeks.every((monday) => data.weeklyTargets.some((snapshot) => snapshot.weekStart === monday)));
  }
  return data;
}

function empty(): TrainingData { return { schemaVersion: 1, profile: null, exercises: [], sessions: [], weeklyTargets: [] }; }

// Pass the existing AsyncStorage instance at the future integration boundary.
// Reuse ONE store per app instance so all training writes share this queue.
export function createTrainingStore(storage: Storage) {
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  async function read() {
    const raw = await storage.getItem(TRAINING_KEY);
    if (raw === null) return { raw, data: empty() };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error("Malformed training JSON; stored data was not reset."); }
    return { raw, data: validateTrainingData(value) };
  }
  function update<T>(mutator: (data: TrainingData) => T): Promise<T> {
    return serialize(async () => {
      const { raw, data } = await read();
      const result = mutator(data); validateTrainingData(data);
      const next = JSON.stringify(data);
      if (await storage.getItem(TRAINING_KEY) !== raw) throw new Error("Training data changed externally. Retry.");
      if (raw !== next) await storage.setItem(TRAINING_KEY, next);
      if (await storage.getItem(TRAINING_KEY) !== next) throw new Error("Training persistence could not be verified. Retry before reporting success.");
      return result;
    });
  }
  function snapshot(data: TrainingData, date: string, capturedAt: string) {
    day(date); instant(capturedAt);
    const monday = weekStart(date);
    if (!data.weeklyTargets.some((item) => item.weekStart === monday)) {
      if (data.profile === null) throw new Error("Set a weekly target before creating a week snapshot.");
      data.weeklyTargets.push({ weekStart: monday, target: data.profile.weeklyTarget, capturedAt });
    }
  }
  function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
  return {
    load: () => serialize(async () => (await read()).data),
    saveProfile: async (value: TrainingProfile, today: string) => {
      profile(value);
      const input = copy(value);
      return update((data) => {
        profile(input);
        if (data.profile && data.profile.id !== input.id) throw new Error("Training profile identity cannot change.");
        data.profile = input;
        snapshot(data, today, input.updatedAt);
      });
    },
    saveExercise: async (value: Exercise) => {
      exercise(value);
      const input = copy(value);
      return update((data) => {
        exercise(input);
        const index = data.exercises.findIndex((item) => item.id === input.id);
        if (index < 0) data.exercises.push(input); else data.exercises[index] = input;
      });
    },
    beginManualSession: async (value: WorkoutSession, initialProfile?: TrainingProfile): Promise<WorkoutSession> => {
      session(value);
      check(value.status === "active" && value.source === "manual");
      const input = copy(value);
      const proposedProfile = initialProfile ? copy(initialProfile) : undefined;
      return update((data) => {
        const existing = data.sessions.find((item) => item.status === "draft" || item.status === "active");
        if (existing) return existing;
        if (data.sessions.some((item) => item.id === input.id)) throw new Error("Session ID already used.");
        if (data.profile === null) {
          if (!proposedProfile) throw new Error("Choose a weekly target before starting.");
          profile(proposedProfile); data.profile = proposedProfile;
        }
        const knownIds = new Set([...BUILT_IN_EXERCISES, ...data.exercises].map((item) => item.id));
        check(input.exercises.length > 0 && input.exercises.every((item) => knownIds.has(item.exerciseId)));
        snapshot(data, input.startedOn, input.createdAt);
        data.sessions.push(input);
        return input;
      });
    },
    finishSession: (id: string, expectedUpdatedAt: string, now: string): Promise<WorkoutSession> => update((data) => {
      const index = data.sessions.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("Workout not found.");
      const current = data.sessions[index];
      if (current.status === "completed") return current; // Retry after an uncertain acknowledgement.
      if (current.updatedAt !== expectedUpdatedAt) throw new Error("Workout changed before finishing. Reopen it before trying again.");
      const completed = finishWorkout(current, now);
      if (completed.status !== "completed") throw new Error("Workout could not be finished.");
      snapshot(data, completed.completedOn, now);
      data.sessions[index] = completed;
      return completed;
    }),
    saveSession: async (value: WorkoutSession) => {
      session(value);
      const input = copy(value);
      return update((data) => {
        session(input);
        const index = data.sessions.findIndex((item) => item.id === input.id);
        const previous = data.sessions[index];
        if (previous && (previous.status === "completed" || previous.status === "discarded")) {
          if (JSON.stringify(previous) !== JSON.stringify(input)) throw new Error("Finalized sessions cannot be rewritten.");
          return;
        }
        if (previous && (previous.createdAt !== input.createdAt || previous.startedOn !== input.startedOn || previous.updatedAt > input.updatedAt)) {
          throw new Error("Session identity or chronology changed.");
        }
        snapshot(data, input.startedOn, input.createdAt);
        if (input.status === "completed") snapshot(data, input.completedOn, input.completedAt);
        if (index < 0) data.sessions.push(input); else data.sessions[index] = input;
      });
    },
    snapshotWeek: (date: string, capturedAt: string): Promise<void> => update((data) => snapshot(data, date, capturedAt)),
  };
}
