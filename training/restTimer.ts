import type { TimerPreferences, WorkoutSession } from "./types";

export function timerExercise(session: WorkoutSession) {
  if (!session.restTimer) return undefined;
  return session.exercises.find((item) => item.id === session.restTimer?.exerciseId)
    ?? session.exercises.find((item) => item.sets.some((set) => set.id === session.restTimer?.triggerSetId))
    ?? (!session.restTimer.exerciseId && !session.restTimer.triggerSetId ? session.exercises[0] : undefined);
}

function editable(session: WorkoutSession) {
  if (session.status !== "active" && session.status !== "draft") throw new Error("This workout is finalized.");
}
export function validateRestDuration(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isSafeInteger(seconds * 1000)) {
    throw new Error("Enter a positive whole number of seconds within the supported range.");
  }
}
export function clearRestTimer(session: WorkoutSession): WorkoutSession {
  if (!session.restTimer) return session;
  const next = { ...session }; delete next.restTimer; return next;
}
export function remainingRestMs(session: WorkoutSession, nowMs: number): number {
  if (session.timer.mode === "off" || session.status === "completed" || session.status === "discarded") return 0;
  const timer = session.restTimer;
  if (!timer) return 0;
  return timer.status === "paused" ? timer.remainingMs : Math.min(timer.durationSeconds * 1000, Math.max(0, Date.parse(timer.deadlineAt) - nowMs));
}
export const REST_DURATIONS = Array.from({ length: 19 }, (_, index) => 30 + index * 15);
export function restDurationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  return [minutes ? `${minutes}m` : "", remainder ? `${remainder}s` : ""].filter(Boolean).join(" ") || "0s";
}
export function exerciseRestSeconds(session: WorkoutSession, exerciseId?: string): number {
  return session.exercises.find((item) => item.id === exerciseId)?.restSeconds ?? session.timer.durationSeconds;
}
export function changeExerciseRest(session: WorkoutSession, exerciseId: string, seconds: number, now: string): WorkoutSession {
  editable(session); validateRestDuration(seconds);
  if (!session.exercises.some((item) => item.id === exerciseId)) throw new Error("Exercise not found.");
  return { ...session, updatedAt: now, exercises: session.exercises.map((item) => item.id === exerciseId ? { ...item, restSeconds: seconds } : item) };
}
export function startRest(session: WorkoutSession, now: string, triggerSetId?: string, exerciseId?: string): WorkoutSession {
  editable(session);
  if (session.timer.mode === "off") return session;
  const movement = triggerSetId ? session.exercises.find((item) => item.sets.some((set) => set.id === triggerSetId))
    : session.exercises.find((item) => item.id === exerciseId);
  const durationSeconds = exerciseRestSeconds(session, movement?.id);
  validateRestDuration(durationSeconds);
  const deadlineMs = Date.parse(now) + durationSeconds * 1000;
  if (!Number.isFinite(new Date(deadlineMs).getTime())) throw new Error("Rest duration exceeds the supported date range.");
  return { ...session, updatedAt: now, restTimer: {
    status: "running", durationSeconds, ...(movement ? { exerciseId: movement.id } : {}),
    deadlineAt: new Date(deadlineMs).toISOString(), ...(triggerSetId ? { triggerSetId } : {}),
  } };
}
export function automaticRest(session: WorkoutSession, setId: string, now: string): WorkoutSession {
  if (session.timer.mode !== "automatic") return session;
  if (!session.exercises.some((item) => item.sets.some((set) => set.id === setId && set.completed))) return session;
  // A repeated completion event for the same set never creates or extends a rest.
  if (session.restTimer?.triggerSetId === setId) return session;
  return startRest(session, now, setId);
}
export function cancelSetRest(session: WorkoutSession, setId: string): WorkoutSession {
  return session.restTimer?.triggerSetId === setId ? clearRestTimer(session) : session;
}
export function pauseRest(session: WorkoutSession, now: string): WorkoutSession {
  editable(session);
  if (session.timer.mode === "off" || session.restTimer?.status !== "running") return session;
  const remainingMs = remainingRestMs(session, Date.parse(now));
  if (remainingMs === 0) return session;
  const { durationSeconds, triggerSetId, exerciseId } = session.restTimer;
  return { ...session, updatedAt: now, restTimer: { status: "paused", durationSeconds, remainingMs, ...(triggerSetId ? { triggerSetId } : {}), ...(exerciseId ? { exerciseId } : {}) } };
}
export function resumeRest(session: WorkoutSession, now: string): WorkoutSession {
  editable(session);
  if (session.timer.mode === "off" || session.restTimer?.status !== "paused") return session;
  const { remainingMs, durationSeconds, triggerSetId, exerciseId } = session.restTimer;
  return { ...session, updatedAt: now, restTimer: { status: "running", durationSeconds,
    deadlineAt: new Date(Date.parse(now) + remainingMs).toISOString(), ...(triggerSetId ? { triggerSetId } : {}), ...(exerciseId ? { exerciseId } : {}) } };
}
export function skipRest(session: WorkoutSession, now: string): WorkoutSession {
  editable(session);
  return { ...clearRestTimer(session), updatedAt: now };
}
export function changeTimerPreferences(session: WorkoutSession, preferences: TimerPreferences, now: string): WorkoutSession {
  editable(session); validateRestDuration(preferences.durationSeconds);
  const next = { ...session, timer: { ...preferences }, updatedAt: now };
  // Changing modes always ends the old rest; duration edits affect the NEXT start.
  return preferences.mode !== session.timer.mode || preferences.mode === "off" ? clearRestTimer(next) : next;
}
export function restClock(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function adjustRest(session: WorkoutSession, deltaSeconds: -15 | 15, now: string): WorkoutSession {
  editable(session);
  const remaining = remainingRestMs(session, Date.parse(now));
  if (!session.restTimer || session.timer.mode === "off" || remaining === 0) return session;
  const nextMs = Math.max(0, remaining + deltaSeconds * 1000);
  const durationSeconds = Math.max(session.restTimer.durationSeconds, Math.ceil(nextMs / 1000));
  validateRestDuration(durationSeconds);
  const restTimer = session.restTimer.status === "paused"
    ? { ...session.restTimer, remainingMs: nextMs, durationSeconds }
    : { ...session.restTimer, deadlineAt: new Date(Date.parse(now) + nextMs).toISOString(), durationSeconds };
  return { ...session, updatedAt: now, restTimer };
}
