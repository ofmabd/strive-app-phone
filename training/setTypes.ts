import type { SetType, WorkoutSet } from "./types";
export const SET_TYPES: { value: SetType; name: string; mark: string; color: string; background: string }[] = [
  { value: "normal", name: "Normal", mark: "", color: "#15191C", background: "#E6E7E1" },
  { value: "drop", name: "Drop", mark: "D", color: "#82591C", background: "#EEE5D2" },
  { value: "failure", name: "Failure", mark: "F", color: "#98443D", background: "#F0DEDA" },
  { value: "warmup", name: "Warm-up", mark: "W", color: "#416B88", background: "#DEE8ED" },
];
export function setType(set: WorkoutSet): SetType { return set.type ?? "normal"; }
export function setLabels(sets: readonly WorkoutSet[]): string[] {
  let normal = 0;
  return sets.map((set) => setType(set) === "normal" ? String(++normal) : SET_TYPES.find((item) => item.value === setType(set))!.mark);
}
