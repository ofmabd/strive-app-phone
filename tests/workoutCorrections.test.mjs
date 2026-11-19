import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const code = ts.transpileModule(readFileSync(new URL(`../training/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; modules.set(name, exports);
  new Function("exports", "require", code)(exports, path => load(path.replace("./", ""))); return exports;
}
const m = load("manual"), life = load("lifecycle"), units = load("weightUnits"), catalog = load("catalog"), history = load("history"), interactions = load("workoutInteractions");
const { createTrainingStore, TRAINING_KEY } = load("storage"), { createSessionAutosave } = load("autosave");
const now = "2026-11-18T12:00:00.000Z", later = "2026-11-18T12:01:00.000Z";
async function fixture() {
  const map = new Map([["workouts", "legacy"], ["scores", "readiness"], ["scores:backup:recovery:v1", "backup"]]);
  const storage = { getItem: async k => map.get(k) ?? null, setItem: async (k,v) => { map.set(k,v); } };
  const store = createTrainingStore(storage), profile = m.manualProfile(3, now);
  await store.saveProfile(profile, "2026-11-18");
  const session = m.createManualSession("Workout", catalog.BUILT_IN_EXERCISES.slice(0, 2), profile, { status: "missing" }, now);
  await store.beginManualSession(session); return { store, map, storage, profile, session };
}
function complete(s, weight = "10", unit = "kg") {
  const e = s.exercises[0], set = e.sets[0];
  s = m.editSet(s, e.id, set.id, "weight", weight, later, unit); s = m.editSet(s, e.id, set.id, "reps", "8", later);
  return m.toggleSet(s, e.id, set.id, later);
}

test("start → draft → autosave → restart → resume → finish → reopen preserves verified history", async () => {
  const x = await fixture(); assert.equal(x.session.status, "draft");
  assert.equal(life.unfinishedWorkout((await x.store.load()).sessions).kind, "review");
  const e = x.session.exercises[0], controller = createSessionAutosave(x.session, s => x.store.saveSession(s));
  controller.edit(s => m.editSet(s, e.id, e.sets[0].id, "weight", "12.", later)); await controller.flush();
  const reopened = createTrainingStore(x.storage); let s = (await reopened.load()).sessions[0];
  assert.equal(life.unfinishedWorkout([s]).kind, "resume"); assert.equal(s.exercises[0].sets[0].draft.weight, "12.");
  s = complete(s); await reopened.saveSession(s); const done = await reopened.finishSession(s.id, s.updatedAt, later);
  const data = await createTrainingStore(x.storage).load();
  assert.equal(life.unfinishedWorkout(data.sessions), null); assert.deepEqual(history.completedHistory(data.sessions), [done]);
  await assert.rejects(reopened.saveSession(s), /Finalized sessions/);
});

test("discard is verified, idempotent, retains the original set data, clears rest and frees the single-workout slot", async () => {
  const x = await fixture(), active = complete(x.session); await x.store.saveSession(active);
  const discarded = await x.store.discardSession(active.id, active.updatedAt, later);
  assert.equal(discarded.status, "discarded"); assert.equal(discarded.restTimer, undefined); assert.deepEqual(discarded.exercises, active.exercises);
  assert.deepEqual(await x.store.discardSession(active.id, active.updatedAt, later), discarded);
  assert.equal(life.unfinishedWorkout((await createTrainingStore(x.storage).load()).sessions), null);
  assert.equal(history.completedHistory([discarded]).length, 0);
  const next = m.createManualSession("Next", catalog.BUILT_IN_EXERCISES.slice(0, 1), x.profile, {status:"missing"}, later);
  await x.store.beginManualSession(next); assert.equal((await x.store.load()).sessions.length, 2);
});

test("finish/discard never occur just because every set is checked; completed history is immutable", async () => {
  const x = await fixture(), active = complete(x.session); await x.store.saveSession(active);
  assert.equal(life.unfinishedWorkout([active]).kind, "resume");
  const done = await x.store.finishSession(active.id, active.updatedAt, later);
  await assert.rejects(x.store.discardSession(done.id, done.updatedAt, later), /completed workout/);
  assert.equal(life.unfinishedWorkout([done, { ...active, id: "discard", status: "discarded", discardedAt: later }]), null);
});

test("legacy untouched/empty drafts are reviewable, never deleted or auto-finished; repeated starts cannot overwrite them", async () => {
  const x = await fixture(); const data = await x.store.load();
  const old = data.sessions[0]; old.status = "active"; old.exercises = []; delete data.preferences;
  x.map.set(TRAINING_KEY, JSON.stringify(data)); const raw = x.map.get(TRAINING_KEY);
  const loaded = await createTrainingStore(x.storage).load(); assert.equal(life.unfinishedWorkout(loaded.sessions).kind, "review");
  assert.equal(x.map.get(TRAINING_KEY), raw);
  const other = m.createManualSession("Other", catalog.BUILT_IN_EXERCISES.slice(0, 1), x.profile, {status:"missing"}, later);
  assert.deepEqual(await x.store.beginManualSession(other), old); assert.equal((await x.store.load()).sessions.length, 1);
});

test("malformed or contradictory legacy completion metadata fails safely without rewriting data", async () => {
  const x = await fixture(), data = await x.store.load();
  data.sessions[0].completedAt = later; x.map.set(TRAINING_KEY, JSON.stringify(data)); const raw = x.map.get(TRAINING_KEY);
  await assert.rejects(createTrainingStore(x.storage).load(), /Invalid training data/); assert.equal(x.map.get(TRAINING_KEY), raw);
});

test("discard write failure and lost acknowledgement retain recoverability and permit a verified retry", async () => {
  const x = await fixture(), write = x.storage.setItem;
  x.storage.setItem = async () => { throw new Error("full"); };
  await assert.rejects(x.store.discardSession(x.session.id, x.session.updatedAt, later), /full/);
  assert.equal((await x.store.load()).sessions[0].status, "draft");
  let failRead = false; const read = x.storage.getItem;
  x.storage.setItem = async (k,v) => { await write(k,v); failRead = true; };
  x.storage.getItem = async k => { if (failRead) { failRead=false; throw new Error("acknowledgement lost"); } return read(k); };
  await assert.rejects(x.store.discardSession(x.session.id, x.session.updatedAt, later), /acknowledgement lost/);
  x.storage.setItem = write;
  assert.equal((await x.store.discardSession(x.session.id, x.session.updatedAt, later)).status, "discarded");
});

test("unit defaults honor existing lb profiles and profile-less preferences persist without inventing setup or weekly targets", async () => {
  assert.equal(units.weightUnit({profile:null}), "kg");
  const map = new Map(), storage = { getItem: async k => map.get(k) ?? null, setItem: async (k,v) => { map.set(k,v); } };
  const store = createTrainingStore(storage); await store.setWeightUnit("lb", now);
  let data = await createTrainingStore(storage).load(); assert.equal(units.weightUnit(data), "lb"); assert.equal(data.profile, null); assert.deepEqual(data.weeklyTargets, []);
  const profile = m.manualProfile(4, now); await store.saveProfile(profile, "2026-11-18");
  data = await store.load(); assert.equal(data.profile.preferredWeightUnit, "lb"); assert.equal(data.profile.weeklyTarget, 4);
  delete data.preferences; map.set(TRAINING_KEY, JSON.stringify(data)); assert.equal(units.weightUnit(await store.load()), "lb");
});

test("135 lb is canonical kg; toggles and display conversion never reinterpret it as 135 kg", () => {
  const profile = m.manualProfile(3, now), s = m.createManualSession("W", catalog.BUILT_IN_EXERCISES.slice(0, 1), profile, {status:"missing"}, now);
  const current = complete(s, "135", "lb"), set = current.exercises[0].sets[0];
  assert.ok(Math.abs(set.weightKg - 61.23496995) < 1e-9); assert.equal(m.displayWeight(set.weightKg, "lb"), "135 lb");
  assert.equal(m.displayWeight(set.weightKg, "kg"), "61.23 kg"); assert.equal(units.inputWeight(set, "kg").value, "61.23497");
  const undone = m.toggleSet(current, current.exercises[0].id, set.id, later);
  assert.equal(m.toggleSet(undone, current.exercises[0].id, set.id, later).exercises[0].sets[0].weightKg, set.weightKg);
  assert.equal(m.displayWeight(null, "lb"), "unweighted"); assert.equal(units.toKilograms(0, "lb"), 0);
});

test("repeated unit preference changes never modify historical loads, active raw input, weekly snapshots or legacy keys", async () => {
  const x = await fixture(), s = complete(x.session, "135", "lb"); await x.store.saveSession(s); await x.store.finishSession(s.id, s.updatedAt, later);
  const before = await x.store.load();
  for (let n = 0; n < 10; n++) { await x.store.setWeightUnit("lb", later); await x.store.setWeightUnit("kg", later); }
  const data = await createTrainingStore(x.storage).load(); assert.deepEqual(data.sessions, before.sessions); assert.deepEqual(data.weeklyTargets, before.weeklyTargets);
  assert.equal(x.map.get("workouts"), "legacy"); assert.equal(x.map.get("scores"), "readiness"); assert.equal(x.map.get("scores:backup:recovery:v1"), "backup");
});

test("partial input is preserved; ambiguous weight blocks a unit change and never gets silently parsed", async () => {
  const x = await fixture(), e = x.session.exercises[0];
  const s = m.editSet(x.session, e.id, e.sets[0].id, "weight", "12.", later); await x.store.saveSession(s); const raw = x.map.get(TRAINING_KEY);
  await assert.rejects(x.store.setWeightUnit("lb", later), /Complete or clear/); assert.equal(x.map.get(TRAINING_KEY), raw);
  assert.deepEqual(units.inputWeight(s.exercises[0].sets[0], "lb"), { value: "12.", unit: "kg" });
});

test("old draft numeric values project in selected units without mutation; only explicit weight input tags the new unit", async () => {
  const x = await fixture(), e = x.session.exercises[0];
  let s = m.editSet(x.session, e.id, e.sets[0].id, "weight", "10", later); await x.store.saveSession(s);
  await x.store.setWeightUnit("lb", later); const before = JSON.stringify(s);
  assert.equal(units.inputWeight(s.exercises[0].sets[0], "lb").value, "22.046226"); assert.equal(JSON.stringify(s), before);
  s = m.editSet(s, e.id, e.sets[0].id, "reps", "8", later); assert.equal(s.exercises[0].sets[0].draft.weightUnit, "kg");
  s = m.editSet(s, e.id, e.sets[0].id, "weight", "135", later, "lb"); s = m.toggleSet(s, e.id, e.sets[0].id, later);
  assert.equal(s.exercises[0].sets[0].draft.weightUnit, "lb"); assert.ok(Math.abs(s.exercises[0].sets[0].weightKg - 61.23496995) < 1e-9);
});

test("unit read-back failures do not report success and historical placeholders use the preferred unit without logging it", async () => {
  const x = await fixture(), write = x.storage.setItem; x.storage.setItem = async () => {};
  await assert.rejects(x.store.setWeightUnit("lb", later), /verified/); assert.equal(units.weightUnit(await x.store.load()), "kg"); x.storage.setItem = write;
  const done = m.finishWorkout(complete(x.session, "135", "lb"), later); done.id = "prior";
  const current = x.session.exercises[0], set = current.sets[0]; const before = JSON.stringify(x.session);
  assert.deepEqual(interactions.previousSetReference([done], current, set.id, x.session.id, "lb"), {weight:"135",reps:"8",unit:"lb"});
  assert.deepEqual(interactions.previousSetReference([done], current, set.id, x.session.id, "kg"), {weight:"61.23",reps:"8",unit:"kg"});
  assert.equal(JSON.stringify(x.session), before); assert.equal(set.weightKg, null);
});

test("a unit preference chosen before starting cannot be overwritten by a stale builder profile", async () => {
  const map = new Map(), storage = { getItem: async k => map.get(k) ?? null, setItem: async (k,v) => { map.set(k,v); } };
  const store = createTrainingStore(storage), profile = m.manualProfile(3, now);
  const proposed = m.createManualSession("Workout", catalog.BUILT_IN_EXERCISES.slice(0, 1), profile, {status:"missing"}, now);
  await store.setWeightUnit("lb", now); await store.beginManualSession(proposed, profile);
  const saved = await store.load(); assert.equal(saved.profile.preferredWeightUnit, "lb"); assert.equal(units.weightUnit(saved), "lb");
});
