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
  new Function("exports", "require", compiled)(exports, (path) => load(path.replace("./", "")));
  modules.set(name, exports);
  return exports;
}
const timer = load("restTimer");
const manual = load("manual");
const { BUILT_IN_EXERCISES } = load("catalog");
const { createTrainingStore, TRAINING_KEY, validateTrainingData } = load("storage");
const { createSessionAutosave } = load("autosave");
const now = "2026-11-10T12:00:00.000Z";
const ms = Date.parse(now);
const at = (seconds) => new Date(ms + seconds * 1000).toISOString();
function fixture(mode = "automatic", durationSeconds = 90) {
  const profile = manual.manualProfile(3,now);
  profile.timer = {mode,durationSeconds};
  return { profile, session:manual.createManualSession("Timer workout",BUILT_IN_EXERCISES.slice(0,2),profile,{status:"missing"},now) };
}
function complete(session,index=0,time=now) {
  const movement = session.exercises[index]; const set = movement.sets[0];
  session = manual.editSet(session,movement.id,set.id,"reps","8",time);
  return manual.toggleSet(session,movement.id,set.id,time);
}
function memory() {
  const data = new Map([["scores","old scores"],["workouts","old workouts"]]);
  const writes = [];
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key,value) => { writes.push(key);data.set(key,value); },
  };
  return { data,writes,storage,store:createTrainingStore(storage) };
}
async function persisted(mode="automatic", durationSeconds=90) {
  const x = memory(); const {profile,session} = fixture(mode,durationSeconds);
  await x.store.beginManualSession(session,profile);
  return {...x,profile,session};
}

test("default automatic rest is 90 seconds and starts only on valid set completion", () => {
  const {session} = fixture();
  assert.equal(session.timer.durationSeconds,90);
  assert.equal(session.restTimer,undefined);
  assert.equal(timer.automaticRest(session,session.exercises[0].sets[0].id,now),session);
  const active = complete(session);
  assert.equal(active.restTimer.status,"running");
  assert.equal(active.restTimer.deadlineAt,at(90));
  assert.equal(active.restTimer.triggerSetId,session.exercises[0].sets[0].id);
});

test("duplicate completion events do not extend rest; a different completed set replaces it", () => {
  const active = complete(fixture().session);
  assert.equal(timer.automaticRest(active,active.restTimer.triggerSetId,at(10)),active);
  const next = complete(active,1,at(20));
  assert.equal(next.restTimer.deadlineAt,at(110));
  assert.equal(next.restTimer.triggerSetId,next.exercises[1].sets[0].id);
  assert.equal(Object.keys(next).filter(key=>key==="restTimer").length,1);
});

test("repeated set taps undo and cancel associated rest; re-completion starts one new rest", () => {
  let session = complete(fixture().session);
  const movement=session.exercises[0]; const set=movement.sets[0];
  session=manual.toggleSet(session,movement.id,set.id,at(1));
  assert.equal(session.restTimer,undefined);
  assert.equal(session.exercises[0].sets[0].completed,false);
  session=manual.toggleSet(session,movement.id,set.id,at(2));
  assert.equal(session.restTimer.deadlineAt,at(92));
});

test("manual mode never auto-starts, but explicit Start Rest does", () => {
  const session=complete(fixture("manual").session);
  assert.equal(session.restTimer,undefined);
  assert.equal(timer.startRest(session,now).restTimer.deadlineAt,at(90));
});

test("off mode clears state and prevents all starts", () => {
  const active=complete(fixture().session);
  const off=timer.changeTimerPreferences(active,{mode:"off",durationSeconds:90},at(1));
  assert.equal(off.restTimer,undefined);
  assert.equal(timer.startRest(off,at(2)),off);
  assert.equal(timer.pauseRest(off,at(2)),off);
  assert.equal(timer.resumeRest(off,at(2)),off);
  assert.equal(complete(off,1,at(3)).restTimer,undefined);
});

test("pause preserves fractional milliseconds and resume uses a fresh deadline", () => {
  const active=timer.startRest(fixture("manual").session,now);
  const paused=timer.pauseRest(active,at(1.25));
  assert.equal(paused.restTimer.remainingMs,88750);
  assert.equal(timer.remainingRestMs(paused,ms+3600000),88750);
  const resumed=timer.resumeRest(paused,at(3600));
  assert.equal(resumed.restTimer.deadlineAt,at(3688.75));
  assert.equal(timer.remainingRestMs(resumed,ms+3601000),87750);
  assert.equal(timer.pauseRest(paused,at(3)),paused);
  assert.equal(timer.resumeRest(resumed,at(3)),resumed);
});

test("skip clears running or paused rest; restart uses current preferences", () => {
  const active=timer.startRest(fixture("manual").session,now);
  assert.equal(timer.skipRest(active,at(5)).restTimer,undefined);
  const paused=timer.pauseRest(active,at(5));
  assert.equal(timer.skipRest(paused,at(6)).restTimer,undefined);
  const restarted=timer.startRest(paused,at(7));
  assert.equal(restarted.restTimer.deadlineAt,at(97));
});

test("duration can exceed five minutes; edits affect the next restart without changing current rest", () => {
  const active=timer.startRest(fixture("manual").session,now);
  const changed=timer.changeTimerPreferences(active,{mode:"manual",durationSeconds:601},at(1));
  assert.equal(changed.restTimer.deadlineAt,at(90));
  assert.equal(changed.restTimer.durationSeconds,90);
  const restarted=timer.startRest(changed,at(2));
  assert.equal(restarted.restTimer.deadlineAt,at(603));
  assert.equal(timer.restClock(601000),"10:01");
  for(const invalid of [0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER]) assert.throws(()=>timer.validateRestDuration(invalid));
});

test("background recovery derives remaining time from the saved deadline, not tick counts", async () => {
  const x=await persisted(); const active=complete(x.session);
  await x.store.saveSession(active);
  const reopened=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(timer.remainingRestMs(reopened,ms+45000),45000);
  assert.equal(timer.remainingRestMs(reopened,ms+3600000),0);
  assert.equal(timer.pauseRest(reopened,at(3600)),reopened);
  assert.equal(timer.restClock(timer.remainingRestMs(reopened,ms+3600000)),"0:00");
  assert.equal(reopened.restTimer.deadlineAt,at(90));
});

test("paused rest and preferences persist through app restart", async () => {
  const x=await persisted("manual",700);
  const active=timer.startRest(x.session,now);
  const paused=timer.pauseRest(active,at(50));
  await x.store.saveSession(paused);
  const reopened=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(reopened.timer.mode,"manual");
  assert.equal(reopened.timer.durationSeconds,700);
  assert.equal(timer.remainingRestMs(reopened,ms+86400000),650000);
  assert.equal(timer.resumeRest(reopened,at(86400)).restTimer.deadlineAt,at(87050));
});

test("countdown reads cause no storage writes and tolerate a backward wall-clock jump", async () => {
  const x=await persisted(); const active=complete(x.session);
  await x.store.saveSession(active); const writes=x.writes.length;
  for(let i=0;i<1000;i++)timer.remainingRestMs(active,ms+i*250);
  assert.equal(x.writes.length,writes);
  assert.equal(timer.remainingRestMs(active,ms-1000),90000);
  assert.ok(x.writes.every(key=>key===TRAINING_KEY));
  assert.equal(x.data.get("scores"),"old scores");
  assert.equal(x.data.get("workouts"),"old workouts");
});

test("timer and set edits share autosave without losing partial input", async () => {
  const x=await persisted();
  const draft=createSessionAutosave(x.session,s=>x.store.saveSession(s));
  draft.edit(s=>complete(s));
  draft.edit(s=>timer.pauseRest(s,at(1)));
  const second=x.session.exercises[1];
  draft.edit(s=>manual.editSet(s,second.id,second.sets[0].id,"weight","12.",at(2)));
  await draft.flush();
  const recovered=(await x.store.load()).sessions[0];
  assert.equal(recovered.restTimer.status,"paused");
  assert.equal(recovered.restTimer.remainingMs,89000);
  assert.equal(recovered.exercises[1].sets[0].draft.weight,"12.");
  assert.equal(recovered.exercises[0].sets[0].completed,true);
});

test("a failed timer save retains its deadline and unsaved edits for verified retry", async () => {
  const x=await persisted(); const set=x.storage.setItem;
  x.storage.setItem=async()=>{throw new Error("disk full");};
  const draft=createSessionAutosave(x.session,s=>x.store.saveSession(s));
  draft.edit(s=>complete(s));
  await assert.rejects(draft.flush(),/disk full/);
  assert.equal(draft.getSnapshot().dirty,true);
  assert.equal(draft.getSnapshot().session.restTimer.deadlineAt,at(90));
  x.storage.setItem=set; await draft.flush();
  const reopened=(await x.store.load()).sessions[0];
  assert.equal(reopened.restTimer.deadlineAt,at(90));
  assert.equal(timer.remainingRestMs(reopened,ms+120000),0);
});

test("finishing clears rest atomically; a failed finish preserves the saved running timer", async () => {
  const x=await persisted(); const active=complete(x.session);
  await x.store.saveSession(active);
  const set=x.storage.setItem;
  x.storage.setItem=async()=>{throw new Error("write failed");};
  await assert.rejects(x.store.finishSession(active.id,active.updatedAt,at(2)),/write failed/);
  assert.equal((await x.store.load()).sessions[0].restTimer.deadlineAt,at(90));
  x.storage.setItem=set;
  const finished=await x.store.finishSession(active.id,active.updatedAt,at(3));
  assert.equal(finished.status,"completed"); assert.equal(finished.restTimer,undefined);
  assert.equal((await createTrainingStore(x.storage).load()).sessions[0].restTimer,undefined);
  assert.deepEqual(await x.store.finishSession(active.id,active.updatedAt,at(4)),finished);
  assert.equal(timer.remainingRestMs(finished,ms),0);
  assert.throws(()=>timer.startRest(finished,at(4)),/finalized/);
});

test("discarding clears rest through the existing store without mutating caller input", async () => {
  const x=await persisted(); const active=complete(x.session);
  await x.store.saveSession(active);
  const discarded={...active,status:"discarded",discardedAt:at(2),updatedAt:at(2)};
  await x.store.saveSession(discarded);
  const recovered=(await x.store.load()).sessions[0];
  assert.equal(recovered.status,"discarded"); assert.equal(recovered.restTimer,undefined);
  assert.ok(discarded.restTimer);
});

test("undoing, editing or removing a trigger cancels only its automatic rest", () => {
  const first=complete(fixture().session); const movement=first.exercises[0]; const set=movement.sets[0];
  assert.equal(manual.editSet(first,movement.id,set.id,"reps","9",at(1)).restTimer,undefined);
  assert.equal(manual.removeSet(first,movement.id,set.id,at(1)).restTimer,undefined);
  assert.equal(manual.removeExercise(first,movement.id,at(1)).restTimer,undefined);
  const second=complete(first,1,at(1));
  const afterUndo=manual.toggleSet(second,movement.id,set.id,at(2));
  assert.equal(afterUndo.restTimer.triggerSetId,second.exercises[1].sets[0].id);
  const restarted=timer.startRest(first,at(3));
  assert.equal(manual.toggleSet(restarted,movement.id,set.id,at(4)).restTimer.deadlineAt,at(93));
});

test("older drafts without timer runtime remain compatible; malformed runtime is never reset", async () => {
  const x=await persisted(); const good=await x.store.load();
  assert.equal(good.sessions[0].restTimer,undefined);
  for(const restTimer of [
    {status:"running",deadlineAt:"bad",durationSeconds:90},
    {status:"paused",remainingMs:-1,durationSeconds:90},
    {status:"paused",remainingMs:91000,durationSeconds:90},
    {status:"paused",remainingMs:1.5,durationSeconds:90},
    {status:"surprise",durationSeconds:90},
    {status:"running",deadlineAt:at(90),durationSeconds:90,triggerSetId:"missing"},
  ]) {
    const broken=JSON.parse(JSON.stringify(good));broken.sessions[0].restTimer=restTimer;
    const raw=JSON.stringify(broken); x.data.set(TRAINING_KEY,raw);
    await assert.rejects(x.store.load());
    await assert.rejects(x.store.saveSession(x.session));
    assert.equal(x.data.get(TRAINING_KEY),raw);
  }
  const off=JSON.parse(JSON.stringify(good));off.sessions[0].timer.mode="off";
  off.sessions[0].restTimer={status:"running",deadlineAt:at(90),durationSeconds:90};
  assert.throws(()=>validateTrainingData(off));
});

test("mode changes stop existing rest without changing set data", () => {
  const active=complete(fixture().session);
  const changed=timer.changeTimerPreferences(active,{mode:"manual",durationSeconds:90},at(2));
  assert.equal(changed.restTimer,undefined);
  assert.deepEqual(changed.exercises,active.exercises);
  const restarted=timer.startRest(changed,at(3));
  const automatic=timer.changeTimerPreferences(restarted,{mode:"automatic",durationSeconds:90},at(4));
  assert.equal(automatic.restTimer,undefined);
});
