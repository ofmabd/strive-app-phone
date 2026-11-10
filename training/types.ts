export type LocalDate = string; // Validated YYYY-MM-DD, interpreted as a local calendar day.
export type WeeklyTarget = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type WeightUnit = "kg" | "lb";
export type WorkoutStatus = "draft" | "active" | "completed" | "discarded";
export type TimerPreferences = {
  mode: "automatic" | "manual" | "off";
  durationSeconds: number; // Positive integer, including durations over five minutes.
};
export const DEFAULT_TIMER: Readonly<TimerPreferences> = { mode: "automatic", durationSeconds: 90 };

export type RecordMetadata = {
  id: string;
  schemaVersion: 1;
  createdAt: string; // ISO UTC instant.
  updatedAt: string;
};
export type PrimaryGoal = "build_muscle" | "increase_strength" | "improve_endurance" | "general_fitness";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Equipment = "full_gym" | "home_equipment" | "bodyweight";

export type TrainingProfile = RecordMetadata & {
  // Optional for compatibility with profiles created before setup existed.
  primaryGoal?: PrimaryGoal;
  experience?: Experience;
  equipment?: Equipment;
  weeklyTarget: WeeklyTarget;
  preferredWeightUnit: WeightUnit;
  timer: TimerPreferences;
  setupStatus: "skipped" | "in_progress" | "complete";
};
export type Exercise = RecordMetadata & {
  name: string;
  source: "built_in" | "custom";
};
export type WorkoutSet = RecordMetadata & {
  completed: boolean;
  reps: number | null;
  weightKg: number | null; // null allows bodyweight/unentered weight; never stores pounds.
  draft: { reps: string; weight: string; weightUnit: WeightUnit };
};
export type SessionExercise = {
  id: string;
  exerciseId: string;
  name: string; // Snapshot preserves history after catalog edits.
  sets: WorkoutSet[];
};
export type ReadinessSnapshot =
  | { status: "missing" }
  | { status: "available"; score: number; localDate: LocalDate };
export type AdjustmentChange = {
  sessionExerciseId: string;
  sets: number;
  reps: number;
  weightKg: number | null;
};
export type TrainingAdjustment = RecordMetadata & {
  reason: "progression" | "readiness";
  changes: AdjustmentChange[];
} & (
  | { status: "proposed" }
  | { status: "approved"; approvedAt: string }
  | { status: "rejected"; rejectedAt: string }
);
export type WorkoutSession = RecordMetadata & {
  name: string;
  source: "manual" | "suggested";
  startedOn: LocalDate;
  exercises: SessionExercise[];
  timer: TimerPreferences;
  readiness: ReadinessSnapshot;
  adjustments: TrainingAdjustment[];
} & (
  | { status: "draft" | "active" }
  | { status: "completed"; completedAt: string; completedOn: LocalDate; finishedEarly: boolean }
  | { status: "discarded"; discardedAt: string }
);
export type WeeklyTargetSnapshot = {
  weekStart: LocalDate; // Monday, immutable once persisted.
  target: WeeklyTarget;
  capturedAt: string;
};
export type TrainingData = {
  schemaVersion: 1;
  profile: TrainingProfile | null;
  exercises: Exercise[];
  sessions: WorkoutSession[];
  weeklyTargets: WeeklyTargetSnapshot[];
};
