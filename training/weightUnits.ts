import type { TrainingData, WeightUnit, WorkoutSet } from "./types";

export const KG_PER_LB = 0.45359237;
export function weightUnit(data: Pick<TrainingData, "preferences" | "profile">): WeightUnit {
  return data.preferences?.weightUnit ?? data.profile?.preferredWeightUnit ?? "kg";
}
export function toKilograms(value: number, unit: WeightUnit): number { return value * (unit === "lb" ? KG_PER_LB : 1); }
export function fromKilograms(value: number, unit: WeightUnit): number { return value / (unit === "lb" ? KG_PER_LB : 1); }
export function weightNumber(value: number, decimals = 2): string { return String(Number(value.toFixed(decimals))); }

// Project for display only. Original draft text/unit and canonical history stay
// untouched. New input is explicitly tagged with the unit visible while typing.
export function inputWeight(set: WorkoutSet, preferred: WeightUnit): { value: string; unit: WeightUnit } {
  if (set.draft.weightUnit === preferred) return { value: set.draft.weight, unit: preferred };
  const text = set.draft.weight.trim().replace(",", ".");
  if (!text) return { value: "", unit: preferred };
  if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) return { value: set.draft.weight, unit: set.draft.weightUnit };
  const kg = set.completed && set.weightKg !== null ? set.weightKg : toKilograms(Number(text), set.draft.weightUnit);
  const value = fromKilograms(kg, preferred);
  if (!Number.isFinite(value)) return { value: set.draft.weight, unit: set.draft.weightUnit };
  return { value: weightNumber(value, 6), unit: preferred };
}
