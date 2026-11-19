import { test } from "node:test";
import assert from "node:assert/strict";
import { uiHarness, byLabel, buttonText, textOf } from "./uiHarness.mjs";

async function run(work) { const h = uiHarness(); try { await work(h); } finally { await h.cleanup(); } }

test("App mounts the gesture root above NavigationContainer, and the active native-stack screen has its own root", async () => run(async h => {
  const app = await h.mount("App.tsx");
  assert.equal(app.root.findByType("NavigationContainer").parent.type, "GestureHandlerRootView");
  const props = await h.prepare(); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  assert.equal(screen.root.findAllByType("GestureHandlerRootView").length, 1);
}));

test("empty plans show Review instead of Resume; entered drafts show Resume and finished sessions never do", async () => run(async h => {
  const props = await h.prepare();
  let train = await h.mount("TrainScreen.tsx", { navigation: h.navigation });
  assert.equal(train.root.findAll(node => node.type === "Pressable" && textOf(node) === "Resume workout").length, 0);
  assert.ok(buttonText(train, "Review saved plan")); await h.act(async () => train.unmount());
  const m = h.load("manual"), e = props.current.exercises[0], set = e.sets[0];
  let edited = m.editSet(props.current, e.id, set.id, "reps", "8", new Date().toISOString()); await h.env.store.saveSession(edited);
  train = await h.mount("TrainScreen.tsx", { navigation: h.navigation }); assert.ok(buttonText(train, "Resume workout")); await h.act(async () => train.unmount());
  edited = m.toggleSet(edited, e.id, set.id, new Date().toISOString()); await h.env.store.saveSession(edited);
  await h.env.store.finishSession(edited.id, edited.updatedAt, new Date().toISOString());
  train = await h.mount("TrainScreen.tsx", { navigation: h.navigation });
  assert.equal(train.root.findAll(node => node.type === "Pressable" && textOf(node) === "Resume workout").length, 0);
}));

test("actual set inputs contain reference placeholders only; changes persist entered values and set type changes the match", async () => run(async h => {
  const props = await h.prepare({ history: true }); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const weight = () => screen.root.findAllByType("TextInput").find(node => node.props.accessibilityLabel.includes("weight in"));
  const reps = () => screen.root.findAllByType("TextInput").find(node => node.props.accessibilityLabel.endsWith(", reps"));
  assert.equal(weight().props.placeholder, "10"); assert.equal(weight().props.value, ""); assert.equal(reps().props.placeholder, "8"); assert.equal(reps().props.value, "");
  assert.ok(!screen.root.findAllByType("Text").some(node => /^(Previous:|Last:)/.test(textOf(node))));
  const type = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel?.includes("Change set type"));
  await h.act(async () => type.props.onPress());
  const drop = screen.root.find(node => node.type === "Pressable" && textOf(node) === "D · Drop");
  await h.act(async () => drop.props.onPress());
  assert.equal(weight().props.placeholder, "—"); assert.equal(reps().props.placeholder, "—");
  await h.act(async () => weight().props.onChangeText("12."));
  assert.equal(weight().props.value, "12.");
  const saved = (await h.env.store.load()).sessions.find(s => s.id === props.current.id);
  assert.equal(saved.exercises[0].sets[0].draft.weight, "12."); assert.equal(saved.exercises[0].sets[0].reps, null);
}));

test("swipe boundary is enabled, exposes the corresponding Delete callback, and Undo restores the full set through autosave", async () => run(async h => {
  const props = await h.prepare({ progress: true }); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const before = props.current.exercises[0].sets[0];
  let row = screen.root.findAllByType("Swipeable")[0]; assert.equal(row.props.enabled, true);
  await h.act(async () => row.props.simulateSwipeLeft());
  const remove = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel?.startsWith("Delete ") && textOf(node) === "Delete");
  await h.act(async () => remove.props.onPress());
  assert.equal(h.env.alerts.length, 0);
  assert.equal((await h.env.store.load()).sessions[0].exercises[0].sets.length, 0);
  await h.act(async () => buttonText(screen, "Undo").props.onPress());
  assert.deepEqual((await h.env.store.load()).sessions[0].exercises[0].sets[0], before);
  row = screen.root.findAllByType("Swipeable")[0];
  const weight = screen.root.findAllByType("TextInput")[0]; await h.act(async () => weight.props.onFocus());
  row = screen.root.findAllByType("Swipeable")[0]; assert.equal(row.props.enabled, true); assert.equal(row.props.hitSlop.width, 44);
}));

test("Edit sets is a visible non-swipe delete alternative without a confirmation", async () => run(async h => {
  const props = await h.prepare(); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const edit = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel?.startsWith("Edit sets for"));
  await h.act(async () => edit.props.onPress());
  const remove = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel?.startsWith("Delete "));
  await h.act(async () => remove.props.onPress()); assert.equal(h.env.alerts.length, 0); assert.ok(buttonText(screen, "Undo"));
}));

test("holding the header opens the real reorder sheet; its handle remains active and drag order autosaves on close", async () => run(async h => {
  const props = await h.prepare(); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const header = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel?.endsWith(", collapse"));
  assert.equal(header.props.delayLongPress, 350);
  await h.act(async () => header.props.onLongPress());
  const handle = screen.root.findAll(node => node.type === "Pressable" && node.props.accessibilityLabel?.startsWith("Drag "))[0];
  await h.act(async () => handle.props.onLongPress());
  assert.notEqual(handle.props.disabled, true);
  const drag = screen.root.findByType("DraggableFlatList"); assert.ok(drag.props.autoscrollThreshold > 0); assert.ok(drag.props.containerStyle.flex > 0);
  await h.act(async () => drag.props.onDragEnd({ data: [...drag.props.data].reverse() }));
  await h.act(async () => byLabel(screen, "Save order and close").props.onPress());
  const saved = (await h.env.store.load()).sessions[0]; assert.deepEqual(saved.exercises, [...props.current.exercises].reverse());
}));

test("exercise action backdrop closes, set-type backdrop closes, and keyboard dismissal preserves inputs and input focus changes", async () => run(async h => {
  const props = await h.prepare(); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const actions = screen.root.findAll(node => node.type === "Pressable" && node.props.accessibilityLabel?.startsWith("Actions for"))[0];
  await h.act(async () => actions.props.onPress()); assert.equal(screen.root.findAllByType("Modal").length, 1);
  await h.act(async () => byLabel(screen, "Close exercise actions").props.onPress()); assert.equal(screen.root.findAllByType("Modal").length, 0);
  const type = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel?.includes("Change set type"));
  await h.act(async () => type.props.onPress()); await h.act(async () => byLabel(screen, "Close set types").props.onPress());
  assert.equal(screen.root.findAllByType("Modal").length, 0);
  const touch = screen.root.findByType("KeyboardAvoidingView").props.onTouchStart;
  const input = { measureInWindow: callback => callback(10, 10, 80, 44) }; h.env.focusedInput = input;
  let before = h.env.dismissed; touch({ nativeEvent: { pageX: 20, pageY: 20 } }); assert.equal(h.env.dismissed, before);
  touch({ nativeEvent: { pageX: 200, pageY: 200 } }); assert.equal(h.env.dismissed, before + 1);
  let measure; h.env.focusedInput = { measureInWindow: callback => { measure = callback; } };
  touch({ nativeEvent: { pageX: 200, pageY: 200 } }); h.env.focusedInput = input; before = h.env.dismissed;
  measure(10, 10, 80, 44); assert.equal(h.env.dismissed, before);
  assert.equal(screen.root.findAllByType("ScrollView")[0].props.keyboardShouldPersistTaps, "always");
}));

test("one timer panel is a sibling after the scroll view, with centered −15s / countdown / +15s and reachable settings", async () => run(async h => {
  const props = await h.prepare({ progress: true });
  const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const panels = screen.root.findAll(node => node.type === "View" && node.props.testID === "workout-rest-timer"); assert.equal(panels.length, 1);
  let parent = panels[0].parent; while (typeof parent.type !== "string") parent = parent.parent;
  assert.equal(parent.type, "KeyboardAvoidingView");
  assert.equal(screen.root.findAll(node => node.type === "ScrollView" && node.findAllByProps({ testID: "workout-rest-timer" }).length > 0).length, 0);
  const session = { ...props.current, restTimer: { status: "running", exerciseId: props.current.exercises[0].id, durationSeconds: 90, deadlineAt: new Date(Date.now() + 90000).toISOString() } };
  const timer = await h.mount("training/RestTimer.tsx", { session, now: Date.now(), disabled: false, edit() {} });
  const row = timer.root.findByProps({ testID: "rest-countdown-row" }); assert.equal(row.props.style.justifyContent, "center");
  assert.equal(textOf(row), "−15s1:30+15s"); assert.ok(buttonText(timer, "Pause")); assert.ok(buttonText(timer, "Skip"));
  await h.act(async () => byLabel(timer, "Workout rest timer settings").props.onPress()); assert.ok(buttonText(timer, "Restart rest"));
  await h.act(async () => byLabel(timer, "Close rest timer settings").props.onPress());
}));

test("Profile saves Pounds only after verification and actual workout inputs store 135 lb as canonical kilograms", async () => run(async h => {
  const props = await h.prepare(); const profile = await h.mount("training/ProfileScreen.tsx");
  await h.act(async () => byLabel(profile, "Pounds (lb)").props.onPress());
  assert.equal(byLabel(profile, "Pounds (lb)").props.accessibilityState.checked, true);
  const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const weight = () => screen.root.findAllByType("TextInput").find(node => node.props.accessibilityLabel.endsWith("weight in lb"));
  const reps = () => screen.root.findAllByType("TextInput").find(node => node.props.accessibilityLabel.endsWith(", reps"));
  await h.act(async () => weight().props.onChangeText("135")); await h.act(async () => reps().props.onChangeText("8"));
  const done = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityRole === "checkbox"); await h.act(async () => done.props.onPress());
  const set = (await h.env.store.load()).sessions[0].exercises[0].sets[0]; assert.ok(Math.abs(set.weightKg - 61.23496995) < 1e-9); assert.equal(set.draft.weightUnit, "lb");
}));

test("Profile failed save never changes the selected unit or reports success", async () => run(async h => {
  await h.prepare(); const profile = await h.mount("training/ProfileScreen.tsx"); h.env.storageFailure = true;
  await h.act(async () => byLabel(profile, "Pounds (lb)").props.onPress());
  assert.equal(byLabel(profile, "Kilograms (kg)").props.accessibilityState.checked, true);
  assert.equal(byLabel(profile, "Pounds (lb)").props.accessibilityState.checked, false);
  assert.ok(profile.root.findAllByType("Text").some(node => textOf(node).includes("Storage failed")));
}));

test("discard confirmation invokes verified storage and reopening Train shows no Resume", async () => run(async h => {
  const props = await h.prepare({ progress: true }); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  await h.act(async () => buttonText(screen, "Discard workout").props.onPress());
  const alert = h.env.alerts.at(-1); assert.equal(alert[0], "Discard workout?");
  await h.act(async () => alert[2].find(button => button.text === "Discard workout").onPress());
  assert.equal((await h.env.store.load()).sessions[0].status, "discarded"); assert.ok(h.env.events.some(event => event[0] === "popTo"));
  const train = await h.mount("TrainScreen.tsx", { navigation: h.navigation }); assert.equal(train.root.findAll(node => node.type === "Pressable" && textOf(node) === "Resume workout").length, 0);
}));

test("verified completion removes Resume, opens Summary, and summary/detail honor Profile units without rewriting loads", async () => run(async h => {
  const props = await h.prepare({ progress: true }); await h.env.store.setWeightUnit("lb", new Date().toISOString());
  const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  await h.act(async () => buttonText(screen, "Finish workout").props.onPress());
  const confirmation = h.env.alerts.at(-1); assert.equal(confirmation[0], "Finish workout?");
  await h.act(async () => confirmation[2].find(button => button.text === "Finish early").onPress());
  const saved = (await h.env.store.load()).sessions[0]; assert.equal(saved.status, "completed"); assert.equal(saved.exercises[0].sets[0].weightKg, 10);
  assert.ok(h.env.events.some(event => event[0] === "replace" && event[1] === "WorkoutSummary"));
  const summary = await h.mount("training/WorkoutSummaryScreen.tsx", { navigation: h.navigation, route: props.route });
  assert.ok(summary.root.findAllByType("Text").some(node => textOf(node).includes("176.37 lb × reps")));
  const Detail = h.load("training/WorkoutHistoryScreen.tsx").WorkoutDetailScreen;
  const { React, act } = await import("./uiHarness.mjs");
  // Update an already tracked renderer so cleanup also unmounts this named screen.
  await act(async () => summary.update(React.createElement(Detail, { route: props.route })));
  assert.ok(summary.root.findAllByType("Text").some(node => textOf(node).includes("22.05 lb × 8 reps")));
  assert.equal((await h.env.store.load()).sessions[0].exercises[0].sets[0].weightKg, 10);
}));

test("failed completion remains visibly unverified, locks edits, and retries without duplicate history", async () => run(async h => {
  const props = await h.prepare({ progress: true }); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  h.env.storageFailure = true;
  await h.act(async () => buttonText(screen, "Finish workout").props.onPress());
  await h.act(async () => h.env.alerts.at(-1)[2].find(button => button.text === "Finish early").onPress());
  assert.equal(h.env.events.length, 0); assert.ok(buttonText(screen, "Retry finish verification"));
  assert.equal(screen.root.find(node => node.type === "Pressable" && node.props.accessibilityRole === "checkbox").props.disabled, true);
  h.env.storageFailure = false; await h.act(async () => buttonText(screen, "Retry finish verification").props.onPress());
  const saved = await h.env.store.load(); assert.equal(saved.sessions.length, 1); assert.equal(saved.sessions[0].status, "completed");
}));

test("failed discard does not navigate away or claim success, and verified retry preserves the discarded record", async () => run(async h => {
  const props = await h.prepare({ progress: true }); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  h.env.storageFailure = true;
  await h.act(async () => buttonText(screen, "Discard workout").props.onPress());
  await h.act(async () => h.env.alerts.at(-1)[2].find(button => button.text === "Discard workout").onPress());
  assert.equal(h.env.events.length, 0); assert.ok(buttonText(screen, "Retry discard verification"));
  h.env.storageFailure = false; await h.act(async () => buttonText(screen, "Retry discard verification").props.onPress());
  const saved = (await h.env.store.load()).sessions[0]; assert.equal(saved.status, "discarded"); assert.deepEqual(saved.exercises, props.current.exercises);
}));

test("per-exercise preset selection changes only its next rest, while timer actions keep source ownership", async () => run(async h => {
  const props = await h.prepare({ progress: true }); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const name = props.current.exercises[0].name;
  await h.act(async () => byLabel(screen, `${name} rest duration settings`).props.onPress());
  await h.act(async () => byLabel(screen, `${name}, 2m 45s`).props.onPress());
  let saved = (await h.env.store.load()).sessions[0]; assert.equal(saved.exercises[0].restSeconds, 165); assert.equal(saved.restTimer.durationSeconds, 90);
  await h.act(async () => byLabel(screen, "Close exercise rest settings").props.onPress());
  const check = () => screen.root.find(node => node.type === "Pressable" && node.props.accessibilityRole === "checkbox");
  await h.act(async () => check().props.onPress()); await h.act(async () => check().props.onPress());
  saved = (await h.env.store.load()).sessions[0]; assert.equal(saved.restTimer.durationSeconds, 165); assert.equal(saved.restTimer.exerciseId, saved.exercises[0].id);
  await h.act(async () => byLabel(screen, "Add 15 seconds").props.onPress());
  saved = (await h.env.store.load()).sessions[0]; assert.equal(saved.restTimer.exerciseId, saved.exercises[0].id); assert.equal(saved.exercises[0].restSeconds, 165);
}));

test("actions-menu reorder waits for native dismissal, and accessible move buttons save on backdrop close", async () => run(async h => {
  const props = await h.prepare(); const screen = await h.mount("training/ActiveWorkoutScreen.tsx", props);
  const actions = screen.root.findAll(node => node.type === "Pressable" && node.props.accessibilityLabel?.startsWith("Actions for"))[0];
  await h.act(async () => actions.props.onPress()); await h.act(async () => buttonText(screen, "Reorder exercises").props.onPress());
  assert.equal(screen.root.findAllByType("Modal").length, 1);
  const move = screen.root.find(node => node.type === "Pressable" && node.props.accessibilityLabel === `Move ${props.current.exercises[0].name} down`);
  await h.act(async () => move.props.onPress()); await h.act(async () => byLabel(screen, "Save order and close").props.onPress());
  assert.deepEqual((await h.env.store.load()).sessions[0].exercises, [...props.current.exercises].reverse());
}));
