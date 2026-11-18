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
const manual=load("manual"); const timer=load("restTimer"); const types=load("setTypes");
const history=load("history"); const catalog=load("catalog");
const {createTrainingStore,TRAINING_KEY}=load("storage");
const {createSessionAutosave}=load("autosave");
const now="2026-11-18T12:00:00.000Z"; const ms=Date.parse(now);
const at=(seconds)=>new Date(ms+seconds*1000).toISOString();
function fixture(){
  const profile=manual.manualProfile(3,now);
  return {profile,session:manual.createManualSession("My workout",catalog.BUILT_IN_EXERCISES.slice(0,2),profile,{status:"missing"},now)};
}
function complete(session,index=0,time=at(1)){
  const movement=session.exercises[index];const set=movement.sets[0];
  return manual.toggleSet(manual.editSet(session,movement.id,set.id,"reps","8",time),movement.id,set.id,time);
}
async function prepared(){
  const data=new Map([["scores","old scores"],["workouts","old notes"]]);const writes=[];
  const storage={getItem:async(key)=>data.get(key)??null,setItem:async(key,value)=>{writes.push(key);data.set(key,value);}};
  const store=createTrainingStore(storage); const {profile,session}=fixture();
  await store.beginManualSession(session,profile);
  return {data,writes,storage,store,profile,session};
}

test("history retrieves only eligible completed structured sessions and de-duplicates IDs",async()=>{
  const x=await prepared(); const ready=complete(x.session);
  await x.store.saveSession(ready);const finished=await x.store.finishSession(ready.id,ready.updatedAt,at(120));
  const second=manual.createManualSession("Unfinished",catalog.BUILT_IN_EXERCISES.slice(0,1),x.profile,{status:"missing"},at(130));
  await x.store.beginManualSession(second);
  const saved=await createTrainingStore(x.storage).load();
  const legacy={date:"Wed Nov 18 2026",workout:"Squats"};
  const discarded={...second,status:"discarded",discardedAt:at(140)};
  const empty={...finished,id:"empty",exercises:[]};
  assert.deepEqual(history.completedHistory([...saved.sessions,finished,discarded,legacy,empty]).map(s=>s.id),[finished.id]);
  assert.ok(x.writes.every(key=>key===TRAINING_KEY));
  assert.equal(x.data.get("workouts"),"old notes");assert.equal(x.data.get("scores"),"old scores");
});

test("history summaries use actual dates, exercises, completed sets and elapsed timestamps",()=>{
  const done=manual.finishWorkout(complete(fixture().session),at(125));
  assert.deepEqual(history.historySummary(done),{exerciseCount:2,completedSets:1,elapsedMs:125000});
  assert.equal(history.elapsedLabel(125000),"Elapsed 2 min");
  assert.equal(history.elapsedLabel(500),"Elapsed <1 min");
  assert.equal(history.historySummary({...done,createdAt:"unknown"}).elapsedMs,null);
  assert.equal(history.elapsedLabel(null),"Duration unavailable");
  assert.ok(history.historyDate(done.completedOn).includes("2026"));
  const newer={...done,id:"new",completedAt:at(180)};const source=[done,newer];
  assert.deepEqual(history.completedHistory(source).map(s=>s.id),["new",done.id]);
  assert.equal(source[0],done);
});

test("history details retain canonical completed performance, unfinished input and type without mutation",async()=>{
  const x=await prepared();const e=x.session.exercises[0];const second=x.session.exercises[1];
  let s=manual.changeSetType(x.session,e.id,e.sets[0].id,"drop",at(1));
  s=manual.editSet(s,second.id,second.sets[0].id,"weight","12.",at(1));
  s=manual.editSet(s,e.id,e.sets[0].id,"weight","20",at(1));s=complete(s);
  await x.store.saveSession(s);await x.store.finishSession(s.id,s.updatedAt,at(10));
  const raw=x.data.get(TRAINING_KEY);const saved=await x.store.load();const details=history.completedHistory(saved.sessions)[0];
  assert.equal(details.exercises[0].sets[0].type,"drop");
  assert.equal(details.exercises[0].sets[0].weightKg,20);
  assert.equal(details.exercises[0].sets[0].reps,8);
  assert.equal(details.exercises[1].sets[0].completed,false);
  assert.equal(details.exercises[1].sets[0].draft.weight,"12.");
  history.historySummary(details);types.setLabels(details.exercises[0].sets);
  assert.equal(x.data.get(TRAINING_KEY),raw);
});

test("old sets default to Normal and normal numbering excludes special sets",()=>{
  const old=fixture().session.exercises[0].sets[0];
  const sets=[{...old,type:"warmup"},old,{...old,type:"drop"},{...old,type:"normal"},{...old,type:"failure"},old];
  assert.equal(types.setType(old),"normal");
  assert.deepEqual(types.setLabels(sets),["W","1","D","2","F","3"]);
  assert.equal(old.type,undefined);
});

test("every set type survives draft autosave, undo/recompletion and completed history",async()=>{
  const x=await prepared();let s=x.session;const e=s.exercises[0];
  for(let i=0;i<3;i++)s=manual.addSet(s,e.id,"kg",at(1));
  for(const [index,type] of ["normal","drop","failure","warmup"].entries()){
    const set=s.exercises[0].sets[index];
    s=manual.changeSetType(s,e.id,set.id,type,at(1));
    s=manual.editSet(s,e.id,set.id,"reps","5",at(1));
    s=manual.toggleSet(s,e.id,set.id,at(1));
    s=manual.toggleSet(s,e.id,set.id,at(1));
    s=manual.toggleSet(s,e.id,set.id,at(1));
  }
  const draft=createSessionAutosave(x.session,value=>x.store.saveSession(value));
  draft.edit(()=>s);await draft.flush();
  const restored=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.deepEqual(restored.exercises[0].sets.map(types.setType),["normal","drop","failure","warmup"]);
  await x.store.finishSession(s.id,s.updatedAt,at(10));
  const detail=history.completedHistory((await x.store.load()).sessions)[0];
  assert.deepEqual(detail.exercises[0].sets.map(types.setType),["normal","drop","failure","warmup"]);
});

test("classification alone does not undo completion or alter the active countdown",()=>{
  const s=complete(fixture().session);const e=s.exercises[0];
  const changed=manual.changeSetType(s,e.id,e.sets[0].id,"failure",at(2));
  assert.equal(changed.exercises[0].sets[0].completed,true);
  assert.deepEqual(changed.restTimer,s.restTimer);
  assert.throws(()=>manual.changeSetType(manual.finishWorkout(s,at(3)),e.id,e.sets[0].id,"normal",at(4)));
});

test("curated titles are consistent, custom case is preserved and search ignores case",()=>{
  assert.equal(catalog.exerciseName("builtin:bench-press","Bench press"),"Bench Press");
  assert.equal(catalog.exerciseName("builtin:push-up","push-up"),"Push-Up");
  const custom=manual.customExercise("  eZ-Bar CURL  ","arms","barbell",now);
  assert.equal(custom.name,"eZ-Bar CURL");assert.equal(catalog.exerciseName(custom.id,custom.name),custom.name);
  assert.deepEqual(catalog.searchExercises([custom],"EZ-BAR curl").map(e=>e.id),[custom.id]);
  assert.deepEqual(catalog.searchExercises([],"BENCH PRESS").map(e=>e.id),["builtin:bench-press"]);
  assert.equal(catalog.BUILT_IN_EXERCISES.find(e=>e.id==="builtin:romanian-deadlift").name,"Romanian Deadlift");
});

test("exercise duration selector is 30 seconds through 5 minutes in 15-second increments",()=>{
  assert.equal(timer.REST_DURATIONS.length,19);assert.equal(timer.REST_DURATIONS[0],30);assert.equal(timer.REST_DURATIONS.at(-1),300);
  assert.ok(timer.REST_DURATIONS.every((value,index)=>value===30+index*15));
  assert.equal(timer.restDurationLabel(60),"1m");assert.equal(timer.restDurationLabel(75),"1m 15s");
  assert.equal(timer.restDurationLabel(90),"1m 30s");assert.equal(timer.restDurationLabel(601),"10m 1s");
});

test("old drafts inherit their saved default without destructive migration or timer changes",async()=>{
  const x=await prepared();let s={...x.session,timer:{mode:"automatic",durationSeconds:601}};
  s=complete(s);delete s.restTimer.exerciseId; // Runtime saved by Milestone 4.
  await x.store.saveSession(s);const raw=x.data.get(TRAINING_KEY);const writes=x.writes.length;
  const restored=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(restored.exercises[0].restSeconds,undefined);
  assert.equal(timer.exerciseRestSeconds(restored,restored.exercises[0].id),601);
  assert.equal(types.setType(restored.exercises[0].sets[0]),"normal");
  assert.equal(timer.remainingRestMs(restored,ms+11000),591000);
  assert.equal(x.data.get(TRAINING_KEY),raw);assert.equal(x.writes.length,writes);
});

test("automatic rest uses the completed exercise duration and maintains a single countdown",()=>{
  let s=fixture().session;const [a,b]=s.exercises;
  s=timer.changeExerciseRest(s,a.id,45,at(1));s=timer.changeExerciseRest(s,b.id,180,at(1));
  s=complete(s,0,at(2));assert.equal(s.restTimer.deadlineAt,at(47));assert.equal(s.restTimer.exerciseId,a.id);
  const duplicate=timer.automaticRest(s,a.sets[0].id,at(3));assert.equal(duplicate,s);
  s=complete(s,1,at(4));assert.equal(s.restTimer.deadlineAt,at(184));assert.equal(s.restTimer.exerciseId,b.id);
});

test("editing an exercise duration preserves active running and paused timer snapshots",()=>{
  const s=complete(fixture().session);const e=s.exercises[0];
  const changed=timer.changeExerciseRest(s,e.id,240,at(2));
  assert.deepEqual(changed.restTimer,s.restTimer);
  assert.equal(timer.exerciseRestSeconds(changed,e.id),240);
  const paused=timer.pauseRest(changed,at(10));const edited=timer.changeExerciseRest(paused,e.id,120,at(11));
  assert.deepEqual(edited.restTimer,paused.restTimer);
  const resumed=timer.resumeRest(edited,at(20));assert.equal(resumed.restTimer.durationSeconds,90);
  assert.equal(resumed.restTimer.exerciseId,e.id);
  const restarted=timer.startRest(resumed,at(21),undefined,e.id);assert.equal(restarted.restTimer.durationSeconds,120);
  assert.equal(restarted.restTimer.deadlineAt,at(141));
});

test("exercise durations and source IDs persist through recovery; manual/off modes remain respected",async()=>{
  const x=await prepared();let s=x.session;const e=s.exercises[0];
  s=timer.changeExerciseRest(s,e.id,75,at(1));s=timer.changeTimerPreferences(s,{mode:"manual",durationSeconds:90},at(1));
  s=complete(s);assert.equal(s.restTimer,undefined);
  s=timer.startRest(s,at(2),undefined,e.id);await x.store.saveSession(s);
  const restored=(await createTrainingStore(x.storage).load()).sessions[0];
  assert.equal(restored.exercises[0].restSeconds,75);assert.equal(restored.restTimer.exerciseId,e.id);
  assert.equal(timer.remainingRestMs(restored,ms+12000),65000);
  const off=timer.changeTimerPreferences(restored,{mode:"off",durationSeconds:90},at(13));
  assert.equal(off.restTimer,undefined);assert.equal(timer.startRest(off,at(14),undefined,e.id),off);
});

test("bad set types and rest values reject saves while preserving the original document",async()=>{
  const x=await prepared();const raw=x.data.get(TRAINING_KEY);
  for(const mutate of [s=>{s.exercises[0].sets[0].type="mystery";},s=>{s.exercises[0].restSeconds=0;},s=>{s.exercises[0].restSeconds=1.5;}]){
    const s=structuredClone(x.session);mutate(s);await assert.rejects(x.store.saveSession(s));assert.equal(x.data.get(TRAINING_KEY),raw);
  }
  let s=complete(x.session);s.restTimer.exerciseId="missing";
  await assert.rejects(x.store.saveSession(s));assert.equal(x.data.get(TRAINING_KEY),raw);
});
