import type { WorkoutSession } from "./types";

// Lives for the screen's lifetime. Failed writes retain the latest in-memory input;
// only a read-back-verified save may mark it clean. No timers/debounce window.
export function createSessionAutosave(initial: WorkoutSession, save: (session: WorkoutSession) => Promise<void>) {
  let state = { session: initial, dirty: false, saving: false, error: null as string | null };
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  function emit(next: typeof state) { state = next; listeners.forEach((listener) => listener()); }
  function flush(): Promise<void> {
    if (running) return running;
    if (!state.dirty) return Promise.resolve();
    // Start on a microtask so running is assigned before even a synchronous failure.
    running = Promise.resolve().then(async () => {
      emit({ ...state, saving: true, error: null });
      try {
        while (state.dirty) {
          const snapshot = state.session;
          await save(snapshot);
          emit({ ...state, dirty: state.session !== snapshot });
        }
      } catch (error) {
        emit({ ...state, error: error instanceof Error ? error.message : "Workout could not be saved." });
        throw error;
      } finally {
        running = null;
        emit({ ...state, saving: false });
      }
    });
    return running;
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    edit: (change: (session: WorkoutSession) => WorkoutSession) => {
      const session = change(state.session);
      emit({ ...state, session, dirty: true, error: null });
      void flush().catch(() => { /* Error is retained in the snapshot for visible retry. */ });
    },
    flush,
  };
}
