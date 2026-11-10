import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Match the existing storage suite: compile pure modules in memory, no artifacts.
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const compiled = ts.transpileModule(readFileSync(new URL(`../training/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (path) => load(path.replace("./", "")));
  modules.set(name, exports);
  return exports;
}
const { createTrainingStore, TRAINING_KEY, validateTrainingData } = load("storage");
const { weekStart, localDate, parseLocalDate, weeklyProgress, consecutiveSuccessfulWeeks, isCompletedWorkout } = load("consistency");
const { DEFAULT_TIMER } = load("types");
const now = "2026-11-02T12:00:00.000Z";
const meta = (id) => ({ id, schemaVersion: 1, createdAt: now, updatedAt: now });
const profile = (target = 3) => ({ ...meta("profile"), weeklyTarget: target, preferredWeightUnit: "lb", timer: { ...DEFAULT_TIMER }, setupStatus: "skipped" });
const exercise = { ...meta("squat"), name: "Squat", source: "built_in" };
function session(id = "session", status = "active", date = "2026-11-02") {
  return {
    ...meta(id), name: "Manual workout", source: "manual", startedOn: date, status,
    exercises: [{ id: "movement", exerciseId: "squat", name: "Squat", sets: [{
      ...meta("set"), completed: status === "completed", reps: status === "completed" ? 5 : null,
      weightKg: null, draft: { reps: "5", weight: "12.", weightUnit: "lb" },
    }] }],
    timer: { mode: "manual", durationSeconds: 601 }, readiness: { status: "missing" }, adjustments: [],
    ...(status === "completed" ? { completedAt: now, completedOn: date, finishedEarly: true } : {}),
    ...(status === "discarded" ? { discardedAt: now } : {}),
  };
}
function memory() {
  const data = new Map([["workouts", "legacy text"], ["scores", "old scores"], ["scores:backup:recovery:v1", "backup"]]);
  const writes = [];
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); data.set(key, value); },
  };
  return { data, writes, storage, store: createTrainingStore(storage) };
}
async function prepared(target = 3) {
  const m = memory();
  await m.store.saveProfile(profile(target), "2026-11-02");
  return m;
}

test("missing training data is empty without writing or touching legacy keys", async () => {
  const m = memory();
  assert.deepEqual(await m.store.load(), { schemaVersion: 1, profile: null, exercises: [], sessions: [], weeklyTargets: [] });
  assert.deepEqual(m.writes, []);
  await m.store.saveProfile(profile(), "2026-11-02");
  assert.ok(m.writes.every((key) => key === TRAINING_KEY));
  assert.equal(m.data.get("workouts"), "legacy text");
  assert.equal(m.data.get("scores"), "old scores");
  assert.equal(m.data.get("scores:backup:recovery:v1"), "backup");
});

test("profile, exercises, canonical weights, timer and missing readiness round-trip", async () => {
  const m = await prepared();
  await m.store.saveExercise(exercise);
  await m.store.saveExercise({ ...exercise, id: "custom", source: "custom" });
  const draft = session();
  draft.exercises[0].sets[0].weightKg = 12.5;
  await m.store.saveSession(draft);
  const data = await createTrainingStore(m.storage).load();
  assert.deepEqual(data.sessions, [draft]);
  assert.equal(data.profile.preferredWeightUnit, "lb");
  assert.equal(data.sessions[0].timer.durationSeconds, 601);
  assert.deepEqual(data.sessions[0].readiness, { status: "missing" });
  assert.equal(data.exercises.length, 2);
  assert.equal(DEFAULT_TIMER.durationSeconds, 90);
});

test("draft set edits survive store recreation and do not count as completion", async () => {
  const m = await prepared();
  const draft = session("draft", "draft");
  await m.store.saveSession(draft);
  const recovered = await createTrainingStore(m.storage).load();
  assert.deepEqual(recovered.sessions[0], draft);
  assert.equal(recovered.sessions[0].exercises[0].sets[0].draft.weight, "12.");
  assert.equal(weeklyProgress(recovered.sessions, recovered.weeklyTargets, "2026-11-02").completed, 0);
});

test("only one draft or active session; same session can autosave and advance", async () => {
  const m = await prepared();
  await m.store.saveSession(session("one", "draft"));
  await m.store.saveSession(session("one", "active"));
  await assert.rejects(m.store.saveSession(session("two")), /Invalid training/);
  await m.store.saveSession(session("one", "completed"));
  await m.store.saveSession(session("two"));
  assert.equal((await m.store.load()).sessions.length, 2);
});

test("completion requires a completed set; early completion counts; discard does not", async () => {
  const m = await prepared(1);
  const empty = session("bad", "completed");
  empty.exercises[0].sets[0].completed = false;
  await assert.rejects(m.store.saveSession(empty));
  const zero = session("zero", "completed");
  zero.exercises[0].sets[0].reps = 0;
  await assert.rejects(m.store.saveSession(zero));
  await m.store.saveSession(session("early", "completed"));
  await m.store.saveSession(session("discard", "discarded"));
  const data = await m.store.load();
  assert.equal(isCompletedWorkout(data.sessions[0]), true);
  assert.deepEqual(weeklyProgress(data.sessions, data.weeklyTargets, "2026-11-08"), {
    weekStart: "2026-11-02", completed: 1, target: 1, successful: true,
  });
  assert.equal(weeklyProgress([data.sessions[0], data.sessions[0]], data.weeklyTargets, "2026-11-02").completed, 1);
});

test("malformed JSON, invalid shapes and unknown versions block all writes without reset", async () => {
  for (const raw of ["{", "null", "[]", JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1 })]) {
    const m = memory();
    m.data.set(TRAINING_KEY, raw);
    await assert.rejects(m.store.load());
    await assert.rejects(m.store.saveProfile(profile(), "2026-11-02"));
    assert.equal(m.data.get(TRAINING_KEY), raw);
    assert.deepEqual(m.writes, []);
  }
});

test("invalid targets, timers, readiness, units and set values are rejected", async () => {
  for (const target of [0, 8, 2.5]) {
    const m = memory();
    await assert.rejects(m.store.saveProfile(profile(target), "2026-11-02"));
    assert.deepEqual(m.writes, []);
  }
  for (const mutate of [
    (s) => { s.timer.durationSeconds = 0; },
    (s) => { s.timer.mode = "always"; },
    (s) => { s.readiness = { status: "missing", score: 50 }; },
    (s) => { s.readiness = { status: "available", score: 101, localDate: "2026-11-02" }; },
    (s) => { s.readiness = { status: "available", score: 50, localDate: "2026-02-30" }; },
    (s) => { s.exercises[0].sets[0].weightKg = -1; },
    (s) => { s.exercises[0].sets[0].draft.weightUnit = "stone"; },
    (s) => { s.exercises[0].sets[0].reps = 1.5; },
    (s) => { s.createdAt = "yesterday"; },
  ]) {
    const m = await prepared();
    const raw = m.data.get(TRAINING_KEY);
    const s = session(); mutate(s);
    await assert.rejects(m.store.saveSession(s));
    assert.equal(m.data.get(TRAINING_KEY), raw);
  }
});

test("all timer modes and long custom durations persist", async () => {
  const m = await prepared();
  for (const mode of ["automatic", "manual", "off"]) {
    const s = session(); s.timer = { mode, durationSeconds: 3600 };
    await m.store.saveSession(s);
    assert.deepEqual((await m.store.load()).sessions[0].timer, s.timer);
  }
});

test("failed reads/writes and failed read-back verification never report success", async () => {
  const m = await prepared();
  const raw = m.data.get(TRAINING_KEY);
  const get = m.storage.getItem;
  m.storage.getItem = async () => { throw new Error("read failed"); };
  await assert.rejects(m.store.saveSession(session()), /read failed/);
  m.storage.getItem = get;
  const set = m.storage.setItem;
  m.storage.setItem = async () => { throw new Error("disk full"); };
  await assert.rejects(m.store.saveSession(session()), /disk full/);
  assert.equal(m.data.get(TRAINING_KEY), raw);
  m.storage.setItem = async () => {};
  await assert.rejects(m.store.saveSession(session()), /verified/);
  assert.equal(m.data.get(TRAINING_KEY), raw);
  m.storage.setItem = set;
  await m.store.saveSession(session()); // A failed operation does not poison the queue.
});

test("interrupted acknowledged writes can resume from persisted draft", async () => {
  const m = await prepared();
  const get = m.storage.getItem;
  const set = m.storage.setItem;
  let written = false;
  m.storage.setItem = async (key, value) => { await set(key, value); written = true; };
  m.storage.getItem = async (key) => {
    if (written) throw new Error("interrupted after write");
    return get(key);
  };
  await assert.rejects(m.store.saveSession(session()), /interrupted/);
  m.storage.getItem = get;
  assert.deepEqual((await createTrainingStore(m.storage).load()).sessions, [session()]);
});

test("concurrent updates serialize and input drafts are snapshotted when called", async () => {
  const m = await prepared();
  const s = session();
  const saving = m.store.saveSession(s);
  s.exercises[0].sets[0].draft.weight = "unsaved mutation";
  await Promise.all([saving, m.store.saveExercise(exercise)]);
  const data = await m.store.load();
  assert.equal(data.exercises.length, 1);
  assert.equal(data.sessions[0].exercises[0].sets[0].draft.weight, "12.");
});

test("weekly targets are immutable and preference changes apply only to unsnapshotted weeks", async () => {
  const m = await prepared(3);
  await m.store.saveProfile(profile(1), "2026-11-05");
  await m.store.snapshotWeek("2026-11-08", now);
  await m.store.snapshotWeek("2026-11-09", now);
  await m.store.saveProfile(profile(7), "2026-11-09");
  const data = await m.store.load();
  assert.deepEqual(data.weeklyTargets.map((s) => [s.weekStart, s.target]), [["2026-11-02", 3], ["2026-11-09", 1]]);
  assert.equal(data.profile.weeklyTarget, 7);
});

test("cross-week completion snapshots both weeks and needs an explicit profile", async () => {
  const missing = memory();
  await assert.rejects(missing.store.saveSession(session()), /weekly target/);
  const m = await prepared(2);
  const s = session("long", "completed");
  s.completedOn = "2026-11-09";
  s.completedAt = s.updatedAt = "2026-11-09T12:00:00.000Z";
  await m.store.saveSession(s);
  const data = await m.store.load();
  assert.equal(data.weeklyTargets.length, 2);
  assert.equal(weeklyProgress(data.sessions, data.weeklyTargets, "2026-11-02").completed, 0);
  assert.equal(weeklyProgress(data.sessions, data.weeklyTargets, "2026-11-09").completed, 1);
});

test("calendar weeks handle Sundays, Mondays, DST, leap days and year boundaries", () => {
  for (const [date, monday] of [
    ["2026-11-01", "2026-10-26"], ["2026-11-02", "2026-11-02"],
    ["2026-03-08", "2026-03-02"], ["2026-03-09", "2026-03-09"],
    ["2027-01-01", "2026-12-28"], ["2024-02-29", "2024-02-26"],
  ]) {
    assert.equal(weekStart(date), monday);
    assert.equal(localDate(parseLocalDate(date)), date);
  }
  for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "11/02/26"]) assert.throws(() => weekStart(date));
});

test("streak uses saved weekly targets, skips unfinished current week, breaks on gaps", () => {
  const sessions = [session("a", "completed", "2026-10-26"), session("b", "completed", "2026-11-02")];
  const snapshots = ["2026-10-26", "2026-11-02", "2026-11-09"].map((weekStart) => ({ weekStart, target: 1, capturedAt: now }));
  assert.equal(consecutiveSuccessfulWeeks(sessions, snapshots, "2026-11-11"), 2);
  assert.equal(consecutiveSuccessfulWeeks(sessions, snapshots, "2026-11-04"), 2);
  assert.equal(consecutiveSuccessfulWeeks(sessions, snapshots, "2026-11-16"), 0);
  assert.equal(consecutiveSuccessfulWeeks(sessions, snapshots.slice(1), "2026-11-11"), 1);
  assert.equal(consecutiveSuccessfulWeeks([], [], "2026-11-11"), 0);
  assert.equal(weeklyProgress(sessions, [], "2026-11-02").target, null);
  assert.equal(weeklyProgress(sessions, [], "2026-11-02").successful, false);
});

test("proposals and approvals remain explicit and are never applied automatically", async () => {
  const m = await prepared();
  const s = session();
  s.adjustments = [{ ...meta("adjust"), reason: "progression", status: "proposed", changes: [
    { sessionExerciseId: "movement", sets: 3, reps: 5, weightKg: 15 },
  ] }];
  await m.store.saveSession(s);
  assert.equal((await m.store.load()).sessions[0].exercises[0].sets[0].weightKg, null);
  s.adjustments[0].status = "approved";
  await assert.rejects(m.store.saveSession(s));
  s.adjustments[0].approvedAt = now;
  await m.store.saveSession(s);
  assert.equal((await m.store.load()).sessions[0].adjustments[0].status, "approved");
});

test("finalized sessions cannot be rewritten and corrupted multiple-active state is rejected", async () => {
  const m = await prepared();
  const done = session("done", "completed");
  await m.store.saveSession(done);
  await m.store.saveSession(done); // Safe retry.
  await assert.rejects(m.store.saveSession({ ...done, name: "changed" }), /Finalized/);
  const data = await m.store.load();
  data.sessions = [session("one"), session("two", "draft")];
  assert.throws(() => validateTrainingData(data));
});

test("non-finite canonical weights are rejected before JSON can turn them into null", async () => {
  const m = await prepared();
  for (const value of [NaN, Infinity, -Infinity]) {
    const s = session(); s.exercises[0].sets[0].weightKg = value;
    await assert.rejects(m.store.saveSession(s));
  }
  assert.deepEqual((await m.store.load()).sessions, []);
});

test("invalid persisted records, duplicate IDs and missing snapshots stay untouched", async () => {
  const m = await prepared();
  await m.store.saveSession(session());
  const valid = await m.store.load();
  for (const mutate of [
    (data) => { data.sessions[0].schemaVersion = 2; },
    (data) => { data.sessions.push(data.sessions[0]); },
    (data) => { data.weeklyTargets = []; },
    (data) => { data.weeklyTargets[0].weekStart = "2026-11-03"; },
    (data) => { data.sessions[0].exercises[0].sets.push(data.sessions[0].exercises[0].sets[0]); },
  ]) {
    const broken = JSON.parse(JSON.stringify(valid)); mutate(broken);
    const raw = JSON.stringify(broken); m.data.set(TRAINING_KEY, raw);
    const writes = m.writes.length;
    await assert.rejects(m.store.load());
    await assert.rejects(m.store.saveExercise(exercise));
    assert.equal(m.data.get(TRAINING_KEY), raw);
    assert.equal(m.writes.length, writes);
  }
});

test("external changes detected before a write are not overwritten", async () => {
  const m = await prepared();
  const original = m.data.get(TRAINING_KEY);
  const get = m.storage.getItem;
  let reads = 0;
  m.storage.getItem = async (key) => {
    if (key === TRAINING_KEY && ++reads === 2) m.data.set(TRAINING_KEY, original + " ");
    return get(key);
  };
  await assert.rejects(m.store.saveSession(session()), /changed externally/);
  assert.equal(m.data.get(TRAINING_KEY), original + " ");
});

test("session eligibility never includes legacy notes, unfinished sessions or discards", () => {
  const legacy = { date: "Mon Nov 02 2026", workout: "Squats" };
  const snapshot = [{ weekStart: "2026-11-02", target: 1, capturedAt: now }];
  assert.equal(weeklyProgress([legacy, session(), session("d", "discarded")], snapshot, "2026-11-02").completed, 0);
  const completed = Array.from({ length: 7 }, (_, i) => session(`done-${i}`, "completed"));
  assert.equal(weeklyProgress(completed, [{...snapshot[0],target:7}], "2026-11-02").successful, true);
});

test("available readiness remains a real explicit snapshot; unapproved changes stay separate", async () => {
  const m = await prepared();
  const s = session(); s.readiness = { status: "available", score: 80, localDate: "2026-11-02" };
  await m.store.saveSession(s);
  assert.deepEqual((await m.store.load()).sessions[0].readiness, s.readiness);
});

const { setupProfile, hasCompletedSetup } = load("setup");
const setupValues = { primaryGoal: "build_muscle", experience: "beginner", equipment: "bodyweight", weeklyTarget: 4 };
test("suggested gate requires all setup answers, including for old complete profiles", () => {
  assert.equal(hasCompletedSetup(null), false);
  assert.equal(hasCompletedSetup({...profile(),setupStatus:"complete"}), false);
  const ready = setupProfile(null, setupValues, now);
  assert.equal(hasCompletedSetup(ready), true);
  for (const field of ["primaryGoal", "experience", "equipment"]) {
    assert.equal(hasCompletedSetup({...ready,[field]:undefined}), false);
  }
});

test("setup persists four answers through the existing store and preserves weekly targets", async () => {
  const m = await prepared(3);
  const existing = {...(await m.store.load()).profile, preferredWeightUnit:"lb", timer:{mode:"off",durationSeconds:700}};
  const changed = setupProfile(existing, setupValues, "2026-11-03T12:00:00.000Z");
  await m.store.saveProfile(changed, "2026-11-03");
  const data = await createTrainingStore(m.storage).load();
  assert.deepEqual(data.profile,changed);
  assert.equal(data.profile.id,existing.id);
  assert.equal(data.profile.createdAt,existing.createdAt);
  assert.equal(data.profile.preferredWeightUnit,"lb");
  assert.deepEqual(data.profile.timer,existing.timer);
  assert.equal(data.weeklyTargets[0].target,3);
  assert.equal(data.profile.weeklyTarget,4);
  assert.ok(m.writes.every(key => key === TRAINING_KEY));
});

test("invalid setup enums and failed setup saves do not report persisted completion", async () => {
  const m = await prepared();
  const raw = m.data.get(TRAINING_KEY);
  for (const field of ["primaryGoal", "experience", "equipment"]) {
    const p = setupProfile(profile(), setupValues, now);
    p[field] = "invalid";
    await assert.rejects(m.store.saveProfile(p, "2026-11-02"));
    assert.equal(m.data.get(TRAINING_KEY), raw);
  }
  m.storage.setItem = async () => { throw new Error("full"); };
  await assert.rejects(m.store.saveProfile(setupProfile(profile(),setupValues,now),"2026-11-02"), /full/);
  assert.equal(hasCompletedSetup((await m.store.load()).profile), false);
});

test("editing setup preserves an unfinished session and its partial set edits", async () => {
  const m = await prepared();
  const active = session();
  await m.store.saveSession(active);
  const before = await m.store.load();
  await m.store.saveProfile(setupProfile(before.profile,setupValues,now),"2026-11-02");
  const after = await createTrainingStore(m.storage).load();
  assert.deepEqual(after.sessions,before.sessions);
  assert.deepEqual(after.weeklyTargets,before.weeklyTargets);
});
