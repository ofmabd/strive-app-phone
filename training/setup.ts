import type { Equipment, Experience, PrimaryGoal, TrainingProfile, WeeklyTarget } from "./types";
import { DEFAULT_TIMER } from "./types";

export const GOALS: { value: PrimaryGoal; label: string }[] = [
  { value: "build_muscle", label: "Build muscle" }, { value: "increase_strength", label: "Increase strength" },
  { value: "improve_endurance", label: "Improve endurance" }, { value: "general_fitness", label: "General fitness" },
];
export const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" },
];
export const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "full_gym", label: "Full gym" }, { value: "home_equipment", label: "Home equipment" }, { value: "bodyweight", label: "Bodyweight" },
];
export const FREQUENCIES: WeeklyTarget[] = [1, 2, 3, 4, 5, 6, 7];
export function hasCompletedSetup(profile: TrainingProfile | null): boolean {
  return profile?.setupStatus === "complete" && !!profile.primaryGoal && !!profile.experience && !!profile.equipment;
}
export function setupProfile(
  existing: TrainingProfile | null,
  values: { primaryGoal: PrimaryGoal; experience: Experience; equipment: Equipment; weeklyTarget: WeeklyTarget },
  now: string,
): TrainingProfile {
  return {
    ...(existing ?? {
      id: "training-profile", schemaVersion: 1, createdAt: now,
      preferredWeightUnit: "kg", timer: { ...DEFAULT_TIMER },
    }),
    ...values, setupStatus: "complete", updatedAt: now,
  };
}
