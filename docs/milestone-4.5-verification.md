# Milestone 4.5: corrective changes and device verification

## Findings and corrections

1. **False Resume:** Train and the manual builder previously selected any `active` or `draft` status, even an untouched plan or an exercise-less record. Starting created an active record immediately, and there was no discard action. New starts are drafts; set edits promote them to active. Shared lifecycle classification offers **Review saved plan** for untouched/empty records and **Resume workout** for unfinished logging. Review preserves the whole record and lets the user continue or explicitly discard it. Finishing/discarding uses serialized, read-back-verified terminal writes; terminal records cannot be resurrected by stale autosave. Checking all sets does not automatically finalize a session. The phone's private AsyncStorage was not available, so its specific offending record cannot be identified conclusively.
2. **Historical references:** starting commit `831344e` already used per-input placeholders, with no visible Previous/Last row. The reported top-of-exercise values cannot be reproduced from that source. Component regressions assert empty values plus actual TextInput placeholders, type/ordinal matching, no duplicate visible history text, and selected units. References never enter autosave or volume calculations. A stale device/Metro bundle is a possibility, not a confirmed diagnosis.
3. **Weight units:** Profile was a placeholder. It now offers locally verified lb/kg preferences in the existing training envelope. An optional `preferences.weightUnit` overrides the existing profile preference; older profiles and the kg default remain valid. No new AsyncStorage key or destructive migration is used. Active numeric drafts are projected for display without rewriting their raw strings/units. New weight input is explicitly tagged with its visible unit. Canonical kg history is never converted in storage. Historical/summary display rounds to two decimals; editable unit projections use up to six decimals. A partial/ambiguous active weight blocks switching to another unit until completed or cleared, preserving that input. No setup/weekly target is invented when changing units without a profile.
4. **Swipe:** previously the gesture root wrapped only the nested Train navigator, rather than the app root or the active native-stack screen. The entire row was also disabled whenever its input had focus. Gesture Handler initializes first in `index.ts`; `App` now wraps NavigationContainer in a flex-1 GestureHandlerRootView, and the active native-stack screen has an explicit root. ReanimatedSwipeable remains installed at 3.3.0; it is not replaced by custom gesture code. Unfocused rows are swipeable across the row; while editing, activation is limited to the leading set-label area so cursor editing remains available. Starting a swipe dismisses the keyboard. Visible **Edit sets** controls provide immediate non-swipe deletion; six-second Undo restores the full set. Exact native gesture-recognition failure on the phone remains unconfirmed without a device trace.
5. **Reorder:** the exercise header had no long-press handler. The overlay's handle was disabled during the gesture it had just started; the list also had no explicit available height. Holding a header now opens reorder, separately from the chevron tap, star and menu. The existing draggable list runs in its own modal GestureHandlerRootView with bounded height/flex, an enabled active handle, drag feedback, auto-scroll and accessible up/down actions. Release autosaves the ordered IDs against the latest records and verifies the write before showing Saved. Accessible moves do the same; failures retain the new order in memory with Retry available. Actions-menu opening waits for the previous iOS modal's dismissal.
6. **Outside dismissal:** separate modal layouts could leave a transparent ScrollView frame consuming taps beyond its visible content, and `keyboardShouldPersistTaps="handled"` did not dismiss for every handled control. Shared sheets use a full backdrop behind a bounded opaque panel and a non-growing inner scroll view. Workout touch observation measures the focused input and dismisses only for outside touches, without claiming the responder. It rechecks focus to avoid blurring the next input. No invisible overlay covers logging controls.
7. **Timer:** embedding was an intentional 4.4 implementation, contrary to the corrected requirement. There is now exactly one footer timer after the workout ScrollView, inside the KeyboardAvoidingView. Equal-width side groups center the countdown between −15s and +15s. A restrained second row exposes pause/resume, skip and settings; restart/modes/default duration are in settings. Idle/off uses one small row. The footer reserves its own space and the existing tab bar supplies bottom safe-area spacing. Per-exercise settings retain the horizontal presets and configure the next rest only. Deadline recovery, persisted ownership and one-countdown semantics remain unchanged.

## Integration and automated coverage

- Expo 58's installed `bundledNativeModules.json` expects Gesture Handler `~3.3.0`, Reanimated `4.7.1` and Worklets `0.13.0`; installed versions match.
- No runtime dependency added or upgraded. Development-only `react-test-renderer@19.3.0` matches React 19.3.0 and mounts the actual components for event/placement regression tests. It emits React's deprecation notice. Native views, gesture recognition and navigation boundaries are mocked; this is not an iOS interaction test.
- Regression suites exercise draft lifecycle/restarts, verified finish/discard and failure retries, legacy preservation, unit conversion/persistence, placeholders, real component callback wiring, Delete/Undo, header and menu reorder paths, focus-safe outside dismissal, timer position/actions and summary/detail units. Existing suites remain intact.
- No source changes to readiness calculations, readiness recovery, legacy workouts/scores keys, history eligibility, consistency calculations or completion-summary calculations.

## Required physical iPhone retest

Pull this branch, run `npm ci`, and start `npx expo start --clear`. This clears the bundler cache, not AsyncStorage. Confirm the expected Profile unit preference and bottom timer are visible before testing.

1. Start without logging, reopen Train: Review saved plan. Enter partial reps/weight, restart: Resume with identical text. Finish with at least one completed set: History entry and no Resume. Explicitly discard a different draft: no Resume, no history/streak credit.
2. Inspect empty normal/special inputs against prior completed workouts. Switch type and check matching placeholders. Check that completing an empty referenced set still requires entered reps.
3. Choose lb in Profile; enter 135 lb; finish and inspect History/Summary. Switch to kg and back; confirm history does not drift. Verify a partial weight is preserved if a unit change is blocked.
4. Swipe an unfocused set left from the row, and from its set-label area while editing. Check vertical scrolling, cursor movement, checkbox taps, Edit sets and Undo.
5. Hold a header; drag the handle across positions and screen edges in a long list. Test accessible moves, backdrop/Done dismissal, autosave and resume. Star/menu taps must not start reordering.
6. Tap outside inputs and each sheet, then between inputs. Ensure first taps on controls work and no text disappears.
7. Confirm bottom countdown centering, quick adjustments, pause/resume, skip/restart and all three modes. Change exercise durations, complete sets in different orders, background/reopen, reorder/remove a timer owner, and finish. Check the last set and Finish action with the keyboard on a small screen and large text.

Physical-device touch recognition, VoiceOver, native modal geometry and keyboard/safe-area layout have **not** been verified in Codex. Treat these changes as ready for that retest, not as iPhone-verified milestone completion.

## Layout and release-save follow-up

Starting from clean, synchronized commit `6cbedfe`, the remaining differences in the expanded request were addressed within the existing implementation:

- Finish was only in the scrollable footer, and the generic native title duplicated a large workout heading. The existing native stack now displays the actual workout title, native Back chevron and one persistent Finish/Retry action. A compact real set count and verified save/error status remain outside the ScrollView; failures expose Retry without scrolling. Confirmation, duplicate prevention and verification use the existing finish/discard functions.
- Outlined exercise cards are replaced by flat sections with fine separators, a deliberate small type scale, 44-point logging controls and compact inline add actions. No reference app artwork, distinctive layout or new theme is copied. The warm off-white workspace and existing charcoal/sage palette remain.
- Dragging previously changed only local sheet state until closing. Drag release and accessible moves now immediately use the existing autosave controller and its verified storage queue. Closing is blocked during a write, and failure leaves Retry in the sheet plus the persistent workout error status if the sheet is dismissed. No second storage or autosave mechanism was added.
- Historical lookup previously selected the latest exercise-containing workout before looking for a matching type. A newer Normal-only session could therefore hide an older Failure/Warm-up reference. The reused lookup now selects the most recent relevant completed source for that exact type occurrence, retaining unfinished row positions and never copying placeholders into drafts. References are memoized across timer ticks, and recomputed on set/type/unit changes.
- The bottom timer, per-exercise presets, profile preferences, canonical data, lifecycle recovery, gesture roots and existing dismissal handlers are retained. No dependencies were added or changed in this follow-up.

Automatic tests mount the production components with mocked native/navigation boundaries; the native header rendering options, release callbacks, storage failures, pending-write close guard and retry paths are exercised. Native touch recognition and pixel geometry still require the iPhone checklist above. The header Finish action and order persistence before closing should also be checked on-device.

Current follow-up files: `training/ActiveWorkoutScreen.tsx`, `training/ReorderExercises.tsx`, `training/manual.ts`, `training/workoutInteractions.ts`, `tests/uiHarness.mjs`, `tests/workoutUI.test.mjs`, `tests/workoutInteractions.test.mjs`, and this document.

## Automated verification results

- `npx tsc --noEmit --pretty false --incremental false`: passed.
- `npm run lint`: passed, no lint warnings.
- Every `tests/*.test.mjs` executed with Node: 152 passed, zero failed/skipped. Includes 13 correction tests, 20 mounted-component tests, and 17 interaction-helper tests.
- `git diff --check`: passed (also checked staged additions before commit).
- iOS JavaScript export: passed, 1,560 modules. Export uses `--no-bytecode` and emits its expected notice. React component tests emit the test renderer deprecation notice.

## Initial corrective implementation files

- `App.tsx`
- `TrainScreen.tsx`
- `index.ts`
- `package-lock.json`
- `package.json`
- `training/ActiveWorkoutScreen.tsx`
- `training/ExerciseActions.tsx`
- `training/ManualWorkoutScreen.tsx`
- `training/ReorderExercises.tsx`
- `training/RestTimer.tsx`
- `training/SetTypeControl.tsx`
- `training/SwipeSetRow.tsx`
- `training/TrainingNavigator.tsx`
- `training/WorkoutHistoryScreen.tsx`
- `training/WorkoutSummaryScreen.tsx`
- `training/manual.ts`
- `training/storage.ts`
- `training/types.ts`
- `training/workoutInteractions.ts`
- `docs/milestone-4.5-verification.md`
- `tests/uiHarness.mjs`
- `tests/workoutCorrections.test.mjs`
- `tests/workoutUI.test.mjs`
- `training/ProfileScreen.tsx`
- `training/WorkoutSheet.tsx`
- `training/keyboard.ts`
- `training/lifecycle.ts`
- `training/weightUnits.ts`
