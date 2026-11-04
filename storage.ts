export type ScoreEntry = { date: string; score: number };
export type WorkoutEntry = { date: string; workout: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isScoreEntry(value: unknown): value is ScoreEntry {
  return isRecord(value) && isValidDate(value.date) &&
    typeof value.score === "number" && Number.isFinite(value.score);
}

function isWorkoutEntry(value: unknown): value is WorkoutEntry {
  return isRecord(value) && isValidDate(value.date) &&
    typeof value.workout === "string";
}

function parseEntries<T>(
  raw: string | null,
  isEntry: (value: unknown) => value is T,
  key: string,
): T[] {
  if (raw === null) return [];

  // Reject the entire payload rather than dropping entries or overwriting bad data.
  // Callers catch read/validation errors before reaching any storage write.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Malformed JSON in AsyncStorage key "${key}"; stored data preserved.`);
  }
  if (!Array.isArray(parsed) || !parsed.every(isEntry)) {
    throw new Error(`Invalid data in AsyncStorage key "${key}"; stored data preserved.`);
  }
  return parsed;
}

export function parseScores(raw: string | null): ScoreEntry[] {
  return parseEntries(raw, isScoreEntry, "scores");
}

export function parseWorkouts(raw: string | null): WorkoutEntry[] {
  return parseEntries(raw, isWorkoutEntry, "workouts");
}
