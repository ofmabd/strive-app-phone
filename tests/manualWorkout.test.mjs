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
const m = load("manual");
const { BUILT_IN_EXERCISES: library, exerciseLibrary, MUSCLES, EXERCISE_EQUIPMENT } = load("catalog");
const { createTrainingStore, TRAINING_KEY } = load("storage");
const { createSessionAutosave } = load("autosave");
const { weeklyProgress } = load("consistency");
const now = "2026-11-10T12:00:00.000Z";
const later = "2026-11-10T13:00:00.000Z";
function memory() {
  const data = new Map([["scores","scores original"],["workouts","workouts original"],["scores:backup:recovery:v1","backup"]]);
  const writes = [];
  const storage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key,value) => { writes.push(key); data.set(key,value); },
  };
  return { data, writes, storage, store:createTrainingStore(storage) };
}
function create(profile = m.manualProfile(3,now)) {
  return m.createManualSession("Session",library.slice(0,2),profile,{status:"missing"},now);
}
async function start() {
  const store = memory();
  const profile = m.manualProfile(3,now);
  const session = await store.store.beginManualSession(create(profile),profile);
  return { ...store, profile, session };
}
function edited(session,field,text,index = 0) {
  const movement = session.exercises[index];
  return m.editSet(session,movement.id,movement.sets[0].id,field,text,later);
}
function completed(session,index = 0) {
  const movement = session.exercises[index];
  return m.toggleSet(edited(session,"reps","8",index),movement.id,movement.sets[0].id,later);
}

test("catalog has stable unique IDs and metadata; custom names receive distinct IDs", () => {
  assert.equal(new Set(library.map(item=>item.id)).size,library.length);
  for (const exercise of library) {
    assert.match(exercise.id,/^builtin:/);
    assert.ok(MUSCLES.includes(exercise.primaryMuscle));
    assert.ok(EXERCISE_EQUIPMENT.includes(exercise.equipment));
  }
  const custom = m.customExercise(" My movement ","back","resistance_band",now);
  assert.equal(custom.name,"My movement");
  assert.notEqual(custom.id,m.customExercise("My movement","back","resistance_band",now).id);
  assert.throws(()=>m.customExercise(" ","back","barbell",now));
  assert.equal(exerciseLibrary([library[0],custom]).length,library.length+1);
});

test("manual creation requires exercise selection, not completed setup or readiness", async () => {
  const x = await start();
  assert.equal(x.session.exercises.length,2);
  assert.equal(x.session.source,"manual");
  assert.deepEqual(x.session.readiness,{status:"missing"});
  assert.equal(x.profile.setupStatus,"skipped");
  assert.ok(x.session.exercises.every(item=>item.sets.length===1 && !item.sets[0].completed));
  assert.throws(()=>m.createManualSession("",[],x.profile,{status:"missing"},now));
  assert.throws(()=>m.createManualSession("",[library[0],library[0]],x.profile,{status:"missing"},now));
});

test("concurrent or retried starts return the same single active workout", async () => {
  const x = memory(); const profile = m.manualProfile(3,now);
  const first = create(profile); const second = create(profile);
  const [a,b] = await Promise.all([x.store.beginManualSession(first,profile),x.store.beginManualSession(second,profile)]);
  assert.equal(a.id,b.id);
  assert.equal((await x.store.load()).sessions.length,1);
  assert.equal((await x.store.beginManualSession(second,profile)).id,a.id);
  assert.deepEqual(x.writes.filter(key=>key!==TRAINING_KEY),[]);
  assert.equal(x.data.get("scores"),"scores original");
  assert.equal(x.data.get("workouts"),"workouts original");
});

test("start failure leaves selection recoverable; retry after uncertain acknowledgement finds the persisted session", async () => {
  const x = memory(); const profile = m.manualProfile(3,now); const session = create(profile);
  const get = x.storage.getItem; const set = x.storage.setItem;
  x.storage.setItem = async()=>{throw new Error("full");};
  await assert.rejects(x.store.beginManualSession(session,profile),/full/);
  assert.equal(x.data.has(TRAINING_KEY),false);
  let failReadBack = false;
  x.storage.setItem = async(key,value)=>{await set(key,value);failReadBack=true;};
  x.storage.getItem = async(key)=>{if(failReadBack)throw new Error("read-back failed");return get(key);};
  await assert.rejects(x.store.beginManualSession(session,profile),/read-back/);
  x.storage.getItem=get; x.storage.setItem=set;
  const recovered = await x.store.beginManualSession(create(profile),profile);
  assert.equal(recovered.id,session.id);
  assert.equal((await x.store.load()).sessions.length,1);
});

test("first manual workout requires an explicit target and does not change an existing profile", async () => {
  const x = memory();
  await assert.rejects(x.store.beginManualSession(create()),/weekly target/);
  const profile = m.manualProfile(7,now);
  profile.preferredWeightUnit="lb";
  await x.store.saveProfile(profile,"2026-11-10");
  await x.store.beginManualSession(create(profile),m.manualProfile(1,now));
  const data = await x.store.load();
  assert.deepEqual(data.profile,profile);
  assert.equal(data.weeklyTargets[0].target,7);
});

test("custom exercise metadata validates and the exercise can be selected in a session", async () => {
  const x = memory(); const profile = m.manualProfile(3,now);
  const custom = m.customExercise("Band curl","arms","resistance_band",now);
  await x.store.saveExercise(custom);
  await assert.rejects(x.store.saveExercise({...custom,equipment:"magic"}));
  const session = m.createManualSession("Custom",[custom],profile,{status:"missing"},now);
  await x.store.beginManualSession(session,profile);
  assert.equal((await x.store.load()).sessions[0].exercises[0].exerciseId,custom.id);
  // Identical retry of an uncertain custom save retains its stable identity.
  await x.store.saveExercise(custom);
  assert.equal((await x.store.load()).exercises.length,1);
});

test("partial set text persists exactly, with no fabricated canonical values", async () => {
  const x = await start();
  const partial = edited(edited(x.session,"weight","12."),"reps","");
  await x.store.saveSession(partial);
  const recovered = (await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(recovered.exercises[0].sets[0].draft.weight,"12.");
  assert.equal(recovered.exercises[0].sets[0].weightKg,null);
  assert.equal(recovered.exercises[0].sets[0].reps,null);
  assert.throws(()=>completed(partial),/complete non-negative weight/);
});

test("sets can complete out of order, undo safely, and editing completion requires rechecking", () => {
  const profile=m.manualProfile(3,now); profile.preferredWeightUnit="lb";
  let session=create(profile);
  session=edited(session,"weight","100",1);
  session=completed(session,1);
  const movement=session.exercises[1]; const set=movement.sets[0];
  assert.equal(session.exercises[0].sets[0].completed,false);
  assert.equal(set.weightKg,45.359237);
  assert.equal(set.reps,8);
  const undone=m.toggleSet(session,movement.id,set.id,later);
  assert.equal(undone.exercises[1].sets[0].completed,false);
  assert.equal(undone.exercises[1].sets[0].draft.weight,"100");
  const changed=edited(session,"reps","9",1);
  assert.equal(changed.exercises[1].sets[0].completed,false);
  assert.equal(changed.exercises[1].sets[0].reps,null);
});

test("invalid reps/weights cannot complete; zero or blank weight is explicit", () => {
  for (const reps of ["","0","-1","1.5","1e2","9007199254740992"]) {
    const s=edited(create(),"reps",reps); const e=s.exercises[0];
    assert.throws(()=>m.toggleSet(s,e.id,e.sets[0].id,later));
  }
  for (const weight of ["12.","-1","Infinity","1e2","abc"]) assert.throws(()=>completed(edited(create(),"weight",weight)));
  assert.equal(completed(edited(create(),"weight","0")).exercises[0].sets[0].weightKg,0);
  assert.equal(completed(create()).exercises[0].sets[0].weightKg,null);
  assert.equal(completed(edited(create(),"weight","12,5")).exercises[0].sets[0].weightKg,12.5);
});

test("adding/removing sets and exercises preserves stable IDs and unrelated input", () => {
  let s=edited(create(),"weight","12."); const first=s.exercises[0];
  s=m.addSet(s,first.id,"kg",later);
  assert.equal(s.exercises[0].sets.length,2);
  assert.notEqual(s.exercises[0].sets[0].id,s.exercises[0].sets[1].id);
  s=m.removeSet(s,first.id,s.exercises[0].sets[1].id,later);
  s=m.addExercise(s,library[2],"kg",later);
  assert.equal(m.addExercise(s,library[2],"kg",later).exercises.length,3);
  s=m.removeExercise(s,s.exercises[2].id,later);
  assert.equal(s.exercises[0].sets[0].draft.weight,"12.");
  assert.equal(s.exercises[0].id,first.id);
});

test("previous performance uses only completed sessions and completed sets", () => {
  const previous=m.finishWorkout(completed(create()),later);
  const active=create();
  assert.equal(m.previousPerformance([active],library[0].id,active.id).length,0);
  assert.equal(m.previousPerformance([previous,active],library[0].id,active.id)[0].reps,8);
  assert.equal(m.previousPerformance([previous],library[1].id,active.id).length,0);
  assert.equal(m.previousPerformance([previous],library[0].id,previous.id).length,0);
});

test("autosave retains newest input during an in-flight save and read-back-verifies recovery", async () => {
  const x=await start();
  let release; let first=true;
  const gate=new Promise(resolve=>{release=resolve;});
  const controller=createSessionAutosave(x.session,async(session)=>{
    if(first){first=false;await gate;}
    await x.store.saveSession(session);
  });
  controller.edit(s=>edited(s,"weight","12."));
  await Promise.resolve();
  controller.edit(s=>edited(s,"weight","12.5"));
  controller.edit(s=>edited(s,"reps","8"));
  assert.equal(controller.getSnapshot().dirty,true);
  release(); await controller.flush();
  assert.equal(controller.getSnapshot().dirty,false);
  assert.equal(controller.getSnapshot().error,null);
  const restored=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(restored.exercises[0].sets[0].draft.weight,"12.5");
  assert.equal(restored.exercises[0].sets[0].draft.reps,"8");
});

test("failed autosave retains unsaved edits and can retry without losing them", async () => {
  const x=await start(); const set=x.storage.setItem;
  x.storage.setItem=async()=>{throw new Error("disk full");};
  const controller=createSessionAutosave(x.session,s=>x.store.saveSession(s));
  controller.edit(s=>edited(s,"weight","17."));
  await assert.rejects(controller.flush(),/disk full/);
  assert.equal(controller.getSnapshot().dirty,true);
  assert.match(controller.getSnapshot().error,/disk full/);
  assert.equal(controller.getSnapshot().session.exercises[0].sets[0].draft.weight,"17.");
  x.storage.setItem=set;
  await controller.flush();
  assert.equal(controller.getSnapshot().dirty,false);
  assert.equal((await createTrainingStore(x.storage).load()).sessions[0].exercises[0].sets[0].draft.weight,"17.");
});

test("acknowledged-but-lost autosave fails verification, retains dirty state and recovers", async () => {
  const x=await start(); const set=x.storage.setItem;
  x.storage.setItem=async()=>{};
  const controller=createSessionAutosave(x.session,s=>x.store.saveSession(s));
  controller.edit(s=>edited(s,"reps","12"));
  await assert.rejects(controller.flush(),/verified/);
  assert.equal(controller.getSnapshot().dirty,true);
  x.storage.setItem=set; await controller.flush();
  assert.equal(controller.getSnapshot().error,null);
});

test("finish summary counts all sets, rejects empty sessions, and permits early completion", async () => {
  const x=await start();
  assert.deepEqual(m.finishSummary(x.session),{completed:0,unfinished:2,canFinish:false});
  await assert.rejects(x.store.finishSession(x.session.id,now,later));
  const ready=completed(x.session);
  assert.deepEqual(m.finishSummary(ready),{completed:1,unfinished:1,canFinish:true});
  await x.store.saveSession(ready);
  const final=await x.store.finishSession(ready.id,ready.updatedAt,later);
  assert.equal(final.status,"completed"); assert.equal(final.finishedEarly,true);
  assert.equal(final.exercises[1].sets[0].completed,false);
  const data=await x.store.load();
  assert.equal(weeklyProgress(data.sessions,data.weeklyTargets,"2026-11-10").completed,1);
});

test("duplicate finish attempts return the original completed session and count only once", async () => {
  const x=await start(); const ready=completed(completed(x.session),1); await x.store.saveSession(ready);
  const a=await x.store.finishSession(ready.id,ready.updatedAt,later);
  const b=await x.store.finishSession(ready.id,ready.updatedAt,"2026-11-11T12:00:00.000Z");
  assert.deepEqual(a,b); assert.equal(a.finishedEarly,false);
  assert.throws(()=>edited(a,"weight","12"),/finalized/);
  const data=await x.store.load(); assert.equal(data.sessions.length,1);
  assert.equal(weeklyProgress(data.sessions,data.weeklyTargets,"2026-11-10").completed,1);
});

test("failed completion never reports success; retry after uncertain write is idempotent", async () => {
  const x=await start(); const ready=completed(x.session); await x.store.saveSession(ready);
  const set=x.storage.setItem; const get=x.storage.getItem;
  x.storage.setItem=async()=>{throw new Error("write failed");};
  await assert.rejects(x.store.finishSession(ready.id,ready.updatedAt,later),/write failed/);
  assert.equal((await x.store.load()).sessions[0].status,"active");
  let after=false;
  x.storage.setItem=async(key,value)=>{await set(key,value);after=true;};
  x.storage.getItem=async(key)=>{if(after)throw new Error("verification interrupted");return get(key);};
  await assert.rejects(x.store.finishSession(ready.id,ready.updatedAt,later),/verification interrupted/);
  x.storage.setItem=set; x.storage.getItem=get;
  const final=await x.store.finishSession(ready.id,ready.updatedAt,"2026-11-11T12:00:00.000Z");
  assert.equal(final.completedAt,later); assert.equal((await x.store.load()).sessions.length,1);
});

test("stale finish requests, discarded workouts and unfinished sets never count", async () => {
  const x=await start(); const ready=completed(x.session); await x.store.saveSession(ready);
  await assert.rejects(x.store.finishSession(ready.id,now,later),/changed/);
  const discarded={...ready,status:"discarded",discardedAt:later};
  await x.store.saveSession(discarded);
  await assert.rejects(x.store.finishSession(ready.id,discarded.updatedAt,later),/finalized/);
  const data=await x.store.load();
  assert.equal(weeklyProgress(data.sessions,data.weeklyTargets,"2026-11-10").completed,0);
});

test("newer edits survive an older in-flight failure", async () => {
  const x=await start(); let reject;
  const gate=new Promise((_,fail)=>{reject=fail;});
  let fail=true;
  const controller=createSessionAutosave(x.session,async(s)=>{if(fail)await gate;await x.store.saveSession(s);});
  controller.edit(s=>edited(s,"weight","1"));
  await Promise.resolve();
  controller.edit(s=>edited(s,"weight","12."));
  const saving=controller.flush(); reject(new Error("interrupted"));
  await assert.rejects(saving,/interrupted/);
  assert.equal(controller.getSnapshot().session.exercises[0].sets[0].draft.weight,"12.");
  fail=false; await controller.flush();
  assert.equal((await x.store.load()).sessions[0].exercises[0].sets[0].draft.weight,"12.");
});

test("finishing across a Monday boundary preserves historical target snapshots", async () => {
  const x=await start(); const ready=completed(x.session); await x.store.saveSession(ready);
  await x.store.saveProfile({...x.profile,weeklyTarget:7,updatedAt:"2026-11-16T12:00:00.000Z"},"2026-11-16");
  await x.store.finishSession(ready.id,ready.updatedAt,"2026-11-16T13:00:00.000Z");
  const data=await x.store.load();
  assert.equal(data.weeklyTargets.find(s=>s.weekStart==="2026-11-09").target,3);
  assert.equal(data.weeklyTargets.find(s=>s.weekStart==="2026-11-16").target,7);
  assert.equal(weeklyProgress(data.sessions,data.weeklyTargets,"2026-11-10").completed,0);
  assert.equal(weeklyProgress(data.sessions,data.weeklyTargets,"2026-11-16").completed,1);
});

test("previous performance selects the latest eligible session without mutating history", () => {
  const first=m.finishWorkout(completed(create()),later);
  const second=m.finishWorkout(completed(edited(create(),"weight","20")),"2026-11-11T12:00:00.000Z");
  const history=[first,second]; const order=history.map(item=>item.id);
  assert.equal(m.previousPerformance(history,library[0].id,"current")[0].weightKg,20);
  assert.deepEqual(history.map(item=>item.id),order);
});
