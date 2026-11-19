import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const compiled = ts.transpileModule(readFileSync(new URL(`../training/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, path => load(path.replace("./", "")));
  modules.set(name, exports); return exports;
}
const m = load("manual"), i = load("workoutInteractions"), timer = load("restTimer"), catalog = load("catalog");
const { createTrainingStore } = load("storage"), { createSessionAutosave } = load("autosave");
const now = "2026-11-18T12:00:00.000Z", later = "2026-11-18T12:01:00.000Z";
function fixture() {
  const profile = m.manualProfile(3, now);
  return { profile, session: m.createManualSession("Workout", catalog.BUILT_IN_EXERCISES.slice(0, 3), profile, { status: "missing" }, now) };
}
function complete(session, index = 0, reps = "8", weight = "10") {
  const e = session.exercises[index], set = e.sets.at(-1);
  session = m.editSet(session, e.id, set.id, "reps", reps, now);
  session = m.editSet(session, e.id, set.id, "weight", weight, now);
  return m.toggleSet(session, e.id, set.id, now);
}
function previous(session, completedAt = later) {
  const done = m.finishWorkout(session, completedAt); return { ...done, id: `history:${completedAt}` };
}
async function prepared() {
  const map = new Map([["scores", "untouched readiness"], ["workouts", "untouched legacy"]]);
  const storage = { getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); } };
  const store = createTrainingStore(storage), f = fixture(); await store.beginManualSession(f.session, f.profile);
  return { ...f, map, storage, store };
}

test("references use the latest completed workout and stable identity, ignoring drafts and current session", () => {
  const s = fixture().session, exercise = s.exercises[0], set = exercise.sets[0];
  const older = previous(complete(s, 0, "5", "20"));
  const latest = previous(complete(s, 0, "6", "30"), "2026-11-18T13:00:00.000Z");
  latest.exercises[0].name = "An older exercise name";
  const unfinished = complete(s, 0, "9", "999"); unfinished.id = "unfinished";
  const reference = i.previousSetReference([older, unfinished, latest], exercise, set.id, s.id);
  assert.deepEqual(reference, { weight: "30", reps: "6", unit: "kg" });
  assert.equal(i.previousSetReference([m.finishWorkout(complete(s), later)], exercise, set.id, s.id), null);
  const differentIdentity = { ...exercise, exerciseId: "custom:different", name: exercise.name };
  assert.equal(i.previousSetReference([latest], differentIdentity, set.id, s.id), null);
});

test("references match type ordinals and old missing types default to Normal", () => {
  let s = complete(fixture().session), e = s.exercises[0];
  // Inserting a warm-up must not shift Normal set references.
  s = m.addSet(s, e.id, "kg", now);
  s = m.changeSetType(s, e.id, s.exercises[0].sets[1].id, "warmup", now);
  s = complete(s, 0, "12", "5");
  s = m.addSet(s, e.id, "kg", now); s = complete(s, 0, "7", "15");
  const history = previous(s); delete history.exercises[0].sets[0].type;
  let today = fixture().session, movement = today.exercises[0];
  today = m.changeSetType(today, movement.id, movement.sets[0].id, "warmup", now);
  today = m.addSet(today, movement.id, "kg", now); today = m.addSet(today, movement.id, "kg", now);
  movement = today.exercises[0];
  const refs = movement.sets.map(set => i.previousSetReference([history], movement, set.id, today.id));
  assert.deepEqual(refs.map(r => [r.weight, r.reps]), [["5", "12"], ["10", "8"], ["15", "7"]]);
});

test("references omit missing history and incomplete sets, support custom IDs, and convert canonical kg to lb", () => {
  let s = fixture().session; s.exercises[0].exerciseId = "custom:stable";
  const done = previous(complete(s, 0, "10", "45.359237"));
  const movement = structuredClone(s.exercises[0]); movement.sets[0].draft.weightUnit = "lb";
  assert.deepEqual(i.previousSetReference([done], movement, movement.sets[0].id, s.id), { weight: "100", reps: "10", unit: "lb" });
  const onlyIncomplete = structuredClone(done); onlyIncomplete.exercises[0].sets[0].completed = false;
  assert.equal(i.previousSetReference([onlyIncomplete], movement, movement.sets[0].id, s.id), null);
  assert.equal(i.previousSetReference([], movement, movement.sets[0].id, s.id), null);
  assert.equal(i.previousSetReference([done], movement, "missing", s.id), null);
  done.exercises[0].sets[0].weightKg = null;
  assert.equal(i.previousSetReference([done], movement, movement.sets[0].id, s.id).weight, "");
});

test("reference rendering does not enter values, complete empty sets, or change Smart Add", () => {
  const s = fixture().session, before = JSON.stringify(s), e = s.exercises[0], set = e.sets[0];
  const history = previous(complete(s));
  assert.ok(i.previousSetReference([history], e, set.id, s.id)); assert.equal(JSON.stringify(s), before);
  assert.throws(() => m.toggleSet(s, e.id, set.id, now), /Enter a whole number/);
  assert.deepEqual(m.addSet(s, e.id, "kg", now).exercises[0].sets[1].draft, set.draft);
  const today = m.editSet(s, e.id, set.id, "weight", "12.", now);
  assert.equal(m.addSet(today, e.id, "kg", now).exercises[0].sets[1].draft.weight, "12.");
});

test("immediate deletion and Undo autosave every value, special type, ID, position and completed state", async () => {
  const x = await prepared(); let s = complete(x.session), e = s.exercises[0];
  s = m.changeSetType(s, e.id, e.sets[0].id, "drop", now); s = m.addSet(s, e.id, "kg", now);
  const removed = i.captureSet(s, e.id, e.sets[0].id);
  const controller = createSessionAutosave(s, value => x.store.saveSession(value));
  controller.edit(current => m.removeSet(current, e.id, removed.set.id, later)); await controller.flush();
  let recovered = (await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(recovered.exercises[0].sets.length, 1); assert.equal(recovered.restTimer, undefined);
  controller.edit(current => i.restoreSet(current, removed, later)); await controller.flush();
  recovered = (await createTrainingStore(x.storage).load()).sessions[0];
  assert.deepEqual(recovered.exercises[0].sets, s.exercises[0].sets);
  assert.equal(recovered.restTimer, undefined); // Undo must not replay an elapsed/source timer.
  assert.deepEqual(recovered.exercises[1], s.exercises[1]);
  assert.equal(x.map.get("scores"), "untouched readiness"); assert.equal(x.map.get("workouts"), "untouched legacy");
});

test("Undo preserves partial input and unit; repeated Undo is idempotent and finalized/missing exercises are guarded", () => {
  let s = fixture().session, e = s.exercises[0], set = e.sets[0];
  s = m.editSet(s, e.id, set.id, "weight", "12,", now); s.exercises[0].sets[0].draft.weightUnit = "lb";
  const removed = i.captureSet(s, e.id, set.id), deleted = m.removeSet(s, e.id, set.id, later);
  const restored = i.restoreSet(deleted, removed, later);
  assert.deepEqual(restored.exercises[0].sets[0], s.exercises[0].sets[0]);
  assert.equal(i.restoreSet(restored, removed, later), restored);
  assert.throws(() => i.restoreSet(m.removeExercise(deleted, e.id, later), removed, later), /exercise was removed/);
  assert.throws(() => i.restoreSet(previous(complete(fixture().session)), removed, later), /finalized/);
});

test("failed deletion writes retain the latest draft and Undo can be verified on retry", async () => {
  const x = await prepared(), e = x.session.exercises[0], removed = i.captureSet(x.session, e.id, e.sets[0].id);
  const write = x.storage.setItem; x.storage.setItem = async () => { throw new Error("disk full"); };
  const controller = createSessionAutosave(x.session, value => x.store.saveSession(value));
  controller.edit(current => m.removeSet(current, e.id, removed.set.id, later));
  await assert.rejects(controller.flush(), /disk full/);
  assert.equal(controller.getSnapshot().dirty, true);
  assert.equal(controller.getSnapshot().session.exercises[0].sets.length, 0);
  assert.equal((await x.store.load()).sessions[0].exercises[0].sets.length, 1);
  controller.edit(current => i.restoreSet(current, removed, later));
  x.storage.setItem = write; await controller.flush();
  assert.equal(controller.getSnapshot().dirty, false);
  assert.deepEqual((await createTrainingStore(x.storage).load()).sessions[0].exercises[0].sets[0], removed.set);
});

test("failed Undo read-back stays dirty until verified; deletion remains undoable in memory", async () => {
  const x = await prepared(), e = x.session.exercises[0], removed = i.captureSet(x.session, e.id, e.sets[0].id);
  const controller = createSessionAutosave(x.session, value => x.store.saveSession(value));
  controller.edit(s => m.removeSet(s, e.id, removed.set.id, later)); await controller.flush();
  const write = x.storage.setItem; x.storage.setItem = async () => {};
  controller.edit(s => i.restoreSet(s, removed, later)); await assert.rejects(controller.flush(), /verif/i);
  assert.equal(controller.getSnapshot().dirty, true); assert.ok(controller.getSnapshot().error);
  assert.deepEqual(controller.getSnapshot().session.exercises[0].sets[0], removed.set);
  x.storage.setItem = write; await controller.flush();
  assert.equal((await x.store.load()).sessions[0].exercises[0].sets.length, 1);
});

test("reorder requires an exact permutation and cannot discard or duplicate exercises", () => {
  const s = fixture().session, ids = s.exercises.map(e => e.id);
  assert.throws(() => i.reorderExercises(s, ids.slice(1), later), /list changed/);
  assert.throws(() => i.reorderExercises(s, [ids[0], ids[0], ids[2]], later), /list changed/);
  assert.throws(() => i.reorderExercises(s, [ids[0], ids[1], "missing"], later), /list changed/);
  assert.equal(i.reorderExercises(s, ids, later), s);
  assert.throws(() => i.reorderExercises(previous(complete(s)), ids, later), /finalized/);
});

test("reorder autosaves the latest records, draft inputs, types and timer without changing IDs or deadline", async () => {
  const x = await prepared(); let s = complete(x.session), e = s.exercises[1];
  s = m.editSet(s, e.id, e.sets[0].id, "weight", "7.", now); s = m.changeSetType(s, e.id, e.sets[0].id, "warmup", now);
  const before = structuredClone(s), ids = s.exercises.map(e => e.id).reverse();
  const controller = createSessionAutosave(s, value => x.store.saveSession(value));
  controller.edit(current => i.reorderExercises(current, ids, later)); await controller.flush();
  const recovered = (await createTrainingStore(x.storage).load()).sessions[0];
  assert.deepEqual(recovered.exercises, [...before.exercises].reverse()); assert.deepEqual(recovered.restTimer, before.restTimer);
  assert.equal(timer.timerExercise(recovered).id, before.exercises[0].id);
  assert.equal(timer.remainingRestMs(recovered, Date.parse(later)), 30000);
});

test("failed reorder remains available for retry without claiming persistence", async () => {
  const x = await prepared(), write = x.storage.setItem, ids = x.session.exercises.map(e => e.id).reverse();
  x.storage.setItem = async () => { throw new Error("write denied"); };
  const controller = createSessionAutosave(x.session, value => x.store.saveSession(value));
  controller.edit(s => i.reorderExercises(s, ids, later)); await assert.rejects(controller.flush(), /write denied/);
  assert.deepEqual(controller.getSnapshot().session.exercises.map(e => e.id), ids); assert.equal(controller.getSnapshot().dirty, true);
  x.storage.setItem = write; await controller.flush(); assert.deepEqual((await x.store.load()).sessions[0].exercises.map(e => e.id), ids);
});

test("legacy trigger-only and global manual timers acquire stable ownership before reorder or deletion", () => {
  let s = complete(fixture().session); const owner = s.exercises[0].id;
  delete s.restTimer.exerciseId;
  assert.equal(timer.timerExercise(s).id, owner);
  let reordered = i.reorderExercises(s, s.exercises.map(e => e.id).reverse(), later);
  assert.equal(reordered.restTimer.exerciseId, owner); assert.equal(timer.timerExercise(reordered).id, owner);
  delete s.restTimer.triggerSetId; // Older global manual start, no explicit owner.
  reordered = i.reorderExercises(s, s.exercises.map(e => e.id).reverse(), later);
  assert.equal(timer.timerExercise(reordered).id, owner);
  assert.equal(m.removeExercise(i.withTimerOwner(s), owner, later).restTimer, undefined);
});

test("collapse is view-only; deleting other exercises preserves pause/resume while deleting the owner ends rest", () => {
  let s = complete(fixture().session), owner = timer.timerExercise(s).id;
  const collapsed = new Set(s.exercises.map(e => e.id)); const before = JSON.stringify(s); collapsed.delete(owner);
  assert.equal(timer.timerExercise(s).id, owner); assert.equal(JSON.stringify(s), before);
  s = timer.pauseRest(s, later); s = i.reorderExercises(s, s.exercises.map(e => e.id).reverse(), later);
  s = m.removeExercise(s, s.exercises.find(e => e.id !== owner).id, later);
  assert.equal(timer.timerExercise(s).id, owner); assert.equal(timer.remainingRestMs(s, Date.parse(later) + 100000), 30000);
  s = timer.resumeRest(s, later); assert.equal(timer.remainingRestMs(s, Date.parse(later) + 10000), 20000);
  assert.equal(m.removeExercise(s, owner, later).restTimer, undefined);
});

test("older records without type, duration override or ownership remain valid and are never migrated on read", async () => {
  const x = await prepared(); let s = complete(x.session);
  delete s.restTimer.exerciseId; delete s.restTimer.triggerSetId; delete s.exercises[0].sets[0].type;
  await x.store.saveSession(s); const raw = [...x.map];
  const loaded = (await createTrainingStore(x.storage).load()).sessions[0];
  assert.deepEqual(loaded, s); assert.deepEqual([...x.map], raw);
  assert.equal(timer.exerciseRestSeconds(loaded, s.exercises[0].id), 90);
  const reordered = i.reorderExercises(loaded, loaded.exercises.map(e => e.id).reverse(), later);
  await x.store.saveSession(reordered); const recovered = (await x.store.load()).sessions[0];
  assert.equal(timer.timerExercise(recovered).id, s.exercises[0].id);
  const done = await x.store.finishSession(recovered.id, recovered.updatedAt, later); assert.equal(done.restTimer, undefined);
});

test("unfinished historical rows retain their ordinal and never shift later performance into an earlier set", () => {
  let s = fixture().session; const e = s.exercises[0];
  s = m.addSet(s, e.id, "kg", now); s = complete(s, 0, "6", "25");
  const done = previous(s);
  let today = fixture().session; today = m.addSet(today, today.exercises[0].id, "kg", now);
  const current = today.exercises[0];
  assert.equal(i.previousSetReference([done], current, current.sets[0].id, today.id), null);
  assert.deepEqual(i.previousSetReference([done], current, current.sets[1].id, today.id), { weight: "25", reps: "6", unit: "kg" });
});

test("a recent Normal-only workout does not hide the most recent matching Failure/Warm-up performance", () => {
  let prior = complete(fixture().session), e = prior.exercises[0];
  prior = m.addSet(prior, e.id, "kg", now);
  prior = m.changeSetType(prior, e.id, prior.exercises[0].sets.at(-1).id, "warmup", now);
  prior = complete(prior, 0, "12", "5");
  prior = m.addSet(prior, e.id, "kg", now);
  prior = m.changeSetType(prior, e.id, prior.exercises[0].sets.at(-1).id, "failure", now);
  prior = complete(prior, 0, "4", "40");
  const older = previous(prior);
  const latest = previous(complete(fixture().session, 0, "9", "20"), "2026-11-18T13:00:00.000Z");
  let today = fixture().session; const movement = today.exercises[0], setId = movement.sets[0].id;
  today = m.changeSetType(today, movement.id, setId, "failure", now);
  assert.deepEqual(i.previousSetReference([older, latest], today.exercises[0], setId, today.id), { weight: "40", reps: "4", unit: "kg" });
  today = m.changeSetType(today, movement.id, setId, "warmup", now);
  assert.equal(i.previousSetReference([older, latest], today.exercises[0], setId, today.id).weight, "5");
  today = m.changeSetType(today, movement.id, setId, "normal", now);
  assert.equal(i.previousSetReference([older, latest], today.exercises[0], setId, today.id).weight, "20");
  assert.equal(m.previousPerformance([older, latest], movement.exerciseId, today.id)[0].weightKg, 20);
  assert.equal(today.exercises[0].sets[0].draft.weight, "");
});

test("reference lookup preserves occurrence positions when falling back past an unfinished matching set", () => {
  let prior = fixture().session, e = prior.exercises[0];
  prior = m.changeSetType(prior, e.id, e.sets[0].id, "failure", now); prior = complete(prior, 0, "5", "30");
  prior = m.addSet(prior, e.id, "kg", now); prior = m.changeSetType(prior, e.id, prior.exercises[0].sets[1].id, "failure", now); prior = complete(prior, 0, "6", "35");
  const old = previous(prior);
  const newer = structuredClone(old); newer.id = "newer"; newer.completedAt = "2026-11-18T13:00:00.000Z";
  newer.exercises[0].sets[0].completed = false;
  newer.exercises[0].sets[1].weightKg = 40;
  let today = fixture().session; const movement = today.exercises[0];
  today = m.changeSetType(today, movement.id, movement.sets[0].id, "failure", now);
  today = m.addSet(today, movement.id, "kg", now); today = m.changeSetType(today, movement.id, today.exercises[0].sets[1].id, "failure", now);
  const refs = today.exercises[0].sets.map(set => i.previousSetReference([newer, old], today.exercises[0], set.id, today.id));
  assert.deepEqual(refs.map(ref => ref.weight), ["30", "40"]);
  assert.ok(today.exercises[0].sets.every(set => !set.completed && set.weightKg === null && set.draft.weight === ""));
});
