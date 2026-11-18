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
  modules.set(name, exports); return exports;
}
const m=load("manual"), timer=load("restTimer"), polish=load("workoutPolish"), catalog=load("catalog"), types=load("setTypes");
const {createTrainingStore}=load("storage");
const now="2026-11-18T12:00:00.000Z", later="2026-11-18T12:01:00.000Z";
function fixture(){const profile=m.manualProfile(3,now);return {profile,session:m.createManualSession("Workout",catalog.BUILT_IN_EXERCISES.slice(0,2),profile,{status:"missing"},now)};}
async function prepared(){const data=new Map();const storage={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>{data.set(k,v);}};const store=createTrainingStore(storage);const f=fixture();await store.beginManualSession(f.session,f.profile);return {...f,store,storage,data};}
function complete(s){const e=s.exercises[0],set=e.sets[0];s=m.editSet(s,e.id,set.id,"reps","8",now);s=m.editSet(s,e.id,set.id,"weight","10",now);return m.toggleSet(s,e.id,set.id,now);}

test("smart add copies partial input and unit but never completion or special type",()=>{
  let s=fixture().session;const e=s.exercises[0],set=e.sets[0];
  s=m.editSet(s,e.id,set.id,"weight","12.",now);s=m.editSet(s,e.id,set.id,"reps","9",now);s=m.changeSetType(s,e.id,set.id,"drop",now);
  s=m.addSet(s,e.id,"lb",now);const added=s.exercises[0].sets[1];
  assert.deepEqual(added.draft,s.exercises[0].sets[0].draft);assert.equal(added.completed,false);assert.equal(added.weightKg,null);assert.equal(added.reps,null);assert.equal(added.type,"normal");assert.notEqual(added.id,set.id);
  assert.deepEqual(types.setLabels(s.exercises[0].sets),["D","1"]);
  s=complete(fixture().session);const copy=m.addSet(s,s.exercises[0].id,"kg",now).exercises[0].sets[1];assert.equal(copy.draft.weight,"10");assert.equal(copy.completed,false);
});

test("running and paused adjustments preserve defaults and recover by deadline",async()=>{
  const x=await prepared();let s=complete(x.session);const original=s.timer,rest=s.exercises[0].restSeconds;
  s=timer.adjustRest(s,15,now);assert.equal(s.restTimer.deadlineAt,"2026-11-18T12:01:45.000Z");assert.deepEqual(s.timer,original);assert.equal(s.exercises[0].restSeconds,rest);
  s=timer.pauseRest(s,later);assert.equal(s.restTimer.remainingMs,45000);s=timer.adjustRest(s,-15,later);assert.equal(s.restTimer.remainingMs,30000);
  await x.store.saveSession(s);s=(await createTrainingStore(x.storage).load()).sessions[0];assert.equal(timer.remainingRestMs(s,Date.parse(later)+100000),30000);
  s=timer.resumeRest(s,later);assert.equal(timer.remainingRestMs(s,Date.parse(later)+10000),20000);
});

test("timer subtraction clamps to zero and adjustments cannot revive expired rest",()=>{
  let s=complete(fixture().session);for(let i=0;i<7;i++)s=timer.adjustRest(s,-15,now);
  assert.equal(timer.remainingRestMs(s,Date.parse(now)),0);assert.equal(timer.adjustRest(s,15,now),s);
  const active=complete(fixture().session);assert.equal(timer.adjustRest(active,15,"2026-11-18T13:00:00.000Z"),active);
});

test("reordering preserves complete records, timer source and saved history order",async()=>{
  const x=await prepared();let s=complete(x.session);const records=structuredClone(s.exercises);const runtime=structuredClone(s.restTimer);
  s=polish.moveExercise(s,s.exercises[1].id,-1,now);assert.deepEqual(s.exercises,[records[1],records[0]]);assert.deepEqual(s.restTimer,runtime);
  await x.store.saveSession(s);assert.deepEqual((await x.store.load()).sessions[0].exercises,s.exercises);
  const done=await x.store.finishSession(s.id,s.updatedAt,later);assert.deepEqual(done.exercises,s.exercises);
  assert.deepEqual(await x.store.finishSession(s.id,s.updatedAt,later),done);
});

test("summary counts only completed exercises and weighted sets with canonical volume",()=>{
  const done=m.finishWorkout(complete(fixture().session),later);const summary=polish.completionSummary(done);
  assert.equal(summary.completedExercises,1);assert.equal(summary.completedSets,1);assert.equal(summary.volumeKg,80);assert.equal(summary.elapsedMs,60000);
  const unweighted=structuredClone(done);unweighted.exercises[0].sets[0].weightKg=null;assert.equal(polish.completionSummary(unweighted).volumeKg,null);
  assert.throws(()=>polish.completionSummary(fixture().session));
});

test("favorites persist idempotently and recents follow actual exercise use",async()=>{
  const x=await prepared();const id=catalog.BUILT_IN_EXERCISES[0].id;
  await x.store.setExerciseFavorite(id,true);await x.store.setExerciseFavorite(id,true);
  let data=await createTrainingStore(x.storage).load();assert.deepEqual(data.exercisePreferences.favoriteIds,[id]);assert.ok(data.exercisePreferences.recentIds.includes(id));
  let sections=polish.pickerSections(data,"");const ids=sections.flatMap(s=>s.exercises.map(e=>e.id));assert.equal(new Set(ids).size,ids.length);assert.equal(sections[0].exercises[0].id,id);
  await x.store.setExerciseFavorite(id,false);assert.deepEqual((await x.store.load()).exercisePreferences.favoriteIds,[]);
  sections=polish.pickerSections(data,"BENCH");assert.ok(sections.flatMap(s=>s.exercises).every(e=>e.name.toLowerCase().includes("bench")));
});

test("old documents infer recents; missing favorites are ignored and custom names resolve current values",()=>{
  const f=fixture();const custom=m.customExercise("Renamed","arms","dumbbell",now);
  const data={schemaVersion:1,profile:f.profile,exercises:[custom],sessions:[f.session],weeklyTargets:[],exercisePreferences:{favoriteIds:["deleted",custom.id],recentIds:[]}};
  assert.equal(polish.pickerSections(data,"")[0].exercises[0].name,"Renamed");
  delete data.exercisePreferences;assert.ok(polish.pickerSections(data,"")[1].exercises.length>0);
});

test("failed favorites save preserves stored data and can retry explicitly",async()=>{
  const x=await prepared();const before=await x.store.load();const set=x.storage.setItem;
  x.storage.setItem=async()=>{throw new Error("full");};await assert.rejects(x.store.setExerciseFavorite("id",true),/full/);assert.deepEqual(await x.store.load(),before);
  x.storage.setItem=set;await x.store.setExerciseFavorite("id",true);assert.deepEqual((await x.store.load()).exercisePreferences.favoriteIds,["id"]);
});

test("view collapse state is separate from session data and order edits do not discard input",()=>{
  const s=complete(fixture().session);const before=JSON.stringify(s);const expanded=new Set(s.exercises.map(e=>e.id));expanded.delete(s.exercises[0].id);expanded.add(s.exercises[0].id);assert.equal(JSON.stringify(s),before);
  assert.equal(polish.moveExercise(s,s.exercises[0].id,-1,now),s);
});

test("immediate set removal autosaves while preserving other sets and clearing its rest trigger",async()=>{
  const x=await prepared();let s=complete(x.session);const exercise=s.exercises[0];
  s=m.addSet(s,exercise.id,"kg",now);await x.store.saveSession(s);
  const controller=load("autosave").createSessionAutosave(s,value=>x.store.saveSession(value));
  controller.edit(current=>m.removeSet(current,exercise.id,exercise.sets[0].id,later));
  await controller.flush();
  const restored=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(restored.exercises[0].sets.length,1);
  assert.equal(restored.exercises[0].sets[0].id,s.exercises[0].sets[1].id);
  assert.equal(restored.restTimer,undefined);
  assert.deepEqual(restored.exercises[1],s.exercises[1]);
});
