// Mount production components with React. Only native/platform boundaries are
// replaced; these tests cannot recognize a physical touch or validate iOS layout.
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL("../", import.meta.url));
const compiled = new Map();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
export { React, act };

export function uiHarness() {
  const modules = new Map(), mounted = [];
  const env = { focusedInput: null, dismissed: 0, alerts: [], events: [], storageFailure: false };
  const map = new Map();
  const storage = { getItem: async key => map.get(key) ?? null, setItem: async (key, value) => {
    if (env.storageFailure) throw new Error("Storage failed"); map.set(key, value);
  } };
  const Keyboard = { dismiss: () => { env.dismissed++; env.focusedInput = null; } };
  const TextInput = Object.assign(props => React.createElement("TextInput", props), { State: { currentlyFocusedInput: () => env.focusedInput } });
  function Modal(props) {
    const previous = React.useRef(false);
    React.useEffect(() => { if (previous.current && !props.visible) props.onDismiss?.(); previous.current = !!props.visible; }, [props.visible]);
    return props.visible ? React.createElement("Modal", props, props.children) : null;
  }
  const rn = Object.fromEntries(["View", "Text", "Pressable", "ScrollView", "KeyboardAvoidingView", "ActivityIndicator", "TouchableOpacity", "FlatList"].map(name => [name, name]));
  Object.assign(rn, { TextInput, Modal, Keyboard, Platform: { OS: "ios" },
    Alert: { alert: (...args) => env.alerts.push(args) },
    StyleSheet: { create: value => value, absoluteFill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }, hairlineWidth: 1 },
    AppState: { currentState: "background", addEventListener: () => ({ remove() {} }) },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 3 }) });
  const navigation = { isFocused: () => true, replace: (...args) => env.events.push(["replace", ...args]),
    navigate: (...args) => env.events.push(["navigate", ...args]), popTo: (...args) => env.events.push(["popTo", ...args]), dispatch() {} };
  function Swipeable(props) {
    const [open, setOpen] = React.useState(false);
    React.useImperativeHandle(props.ref, () => ({ close: () => setOpen(false), openRight: () => setOpen(true) }), []);
    return React.createElement("Swipeable", { ...props, simulateSwipeLeft: () => { if (props.enabled) { props.onSwipeableOpenStartDrag?.(); setOpen(true); } } },
      props.children, open && props.renderRightActions());
  }
  function DragList(props) {
    const [active, setActive] = React.useState(-1);
    return React.createElement("DraggableFlatList", props, props.data.map((item, index) => React.createElement(React.Fragment, { key: item.id },
      props.renderItem({ item, getIndex: () => index, isActive: index === active, drag: () => { setActive(index); props.onDragBegin?.(index); } }))));
  }
  const navigator = () => ({ Navigator: "Navigator", Screen: "Screen" });
  const mocks = {
    "react-native": rn,
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    "@react-navigation/native": { NavigationContainer: "NavigationContainer", useFocusEffect: callback => React.useEffect(callback, [callback]), usePreventRemove() {}, useIsFocused: () => true },
    "@react-navigation/native-stack": { createNativeStackNavigator: navigator },
    "@react-navigation/bottom-tabs": { createBottomTabNavigator: navigator },
    "react-native-gesture-handler": { GestureHandlerRootView: "GestureHandlerRootView" },
    "react-native-gesture-handler/ReanimatedSwipeable": { __esModule: true, default: Swipeable },
    "react-native-draggable-flatlist": { __esModule: true, default: DragList, ScaleDecorator: ({ children }) => children },
    "react-native-svg": { __esModule: true, default: "Svg", Circle: "Circle", Path: "Path" },
    "expo-status-bar": { StatusBar: "StatusBar" }, "expo-haptics": {},
    "@react-native-async-storage/async-storage": { __esModule: true, default: storage },
  };
  function loadFile(path) {
    const file = resolve(project, path);
    if (file === resolve(project, "appStores.ts")) return { trainingStore: env.store, scoreStore: { load: async () => [] } };
    if (modules.has(file)) return modules.get(file);
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText);
    const exports = {}; modules.set(file, exports);
    new Function("exports", "require", compiled.get(file))(exports, name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith(".")) return require(name);
      const base = resolve(dirname(file), name);
      for (const suffix of [".ts", ".tsx"]) {
        try { readFileSync(base + suffix); return loadFile(base + suffix); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      throw new Error(`Missing module ${base}`);
    });
    return exports;
  }
  const load = name => loadFile(name.startsWith("training/") || name === "App.tsx" || name === "TrainScreen.tsx" ? name : `training/${name}.ts`);
  env.store = load("storage").createTrainingStore(storage);
  async function mount(name, props = {}) {
    let renderer;
    await act(async () => { renderer = create(React.createElement(load(name).default, props)); });
    mounted.push(renderer); return renderer;
  }
  async function cleanup() { for (const renderer of mounted) await act(async () => renderer.unmount()); }
  async function prepare({ history = false, progress = false } = {}) {
    const m = load("manual"), catalog = load("catalog"), date = "2026-11-18T12:00:00.000Z";
    const profile = m.manualProfile(3, date);
    await env.store.saveProfile(profile, "2026-11-18");
    function session() { return m.createManualSession("Workout", catalog.BUILT_IN_EXERCISES.slice(0, 2), profile, { status: "missing" }, date); }
    function completed(s) {
      const e = s.exercises[0], set = e.sets[0];
      s = m.editSet(s, e.id, set.id, "weight", "10", date); s = m.editSet(s, e.id, set.id, "reps", "8", date);
      return m.toggleSet(s, e.id, set.id, date);
    }
    if (history) await env.store.saveSession(m.finishWorkout(completed(session()), "2026-11-18T12:01:00.000Z"));
    const current = progress ? completed(session()) : session();
    await env.store.beginManualSession(current);
    return { current, navigation, route: { params: { sessionId: current.id } }, profile };
  }
  return { env, load, mount, cleanup, prepare, storage, map, navigation, act };
}
export function byLabel(renderer, label) {
  return renderer.root.find(node => typeof node.type === "string" && node.props.accessibilityLabel === label);
}
export function textOf(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.children?.map(textOf).join("") ?? "";
}
export function buttonText(renderer, text) {
  return renderer.root.find(node => node.type === "Pressable" && textOf(node) === text);
}
