import { useRef, useState } from "react";
import { Keyboard, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, { ScaleDecorator } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SessionExercise } from "./types";
import { exerciseName } from "./catalog";
import WorkoutIcon from "./WorkoutIcon";
import { colors, styles } from "./styles";

export default function ReorderExercises({ exercises, onClose }: { exercises: SessionExercise[]; onClose: (ids: string[]) => void }) {
  const [order, setOrder] = useState(exercises);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(order);
  const draggingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const sheetHeight = Math.max(200, Math.min(window.height - insets.top - insets.bottom - 48, 140 + order.length * 76 * window.fontScale));
  function update(next: SessionExercise[]) { latest.current = next; setOrder(next); }
  function close() { if (!draggingRef.current) onClose(latest.current.map((item) => item.id)); }
  function move(index: number, direction: -1 | 1) {
    const next = [...latest.current];
    const destination = index + direction;
    if (destination < 0 || destination >= next.length || draggingRef.current) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    update(next);
  }
  return <Modal transparent visible animationType="fade" onShow={Keyboard.dismiss} onRequestClose={close}>
    <GestureHandlerRootView style={reorderStyles.root}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Save order and close" disabled={dragging} onPress={close} />
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={[reorderStyles.sheet, { height: sheetHeight, marginTop: insets.top + 16, marginBottom: insets.bottom + 16 }]}>
        <View style={reorderStyles.header}>
          <Text style={[styles.heading, { flex: 1 }]} accessibilityRole="header">Reorder exercises</Text>
          <Pressable accessibilityRole="button" disabled={dragging} onPress={close} style={reorderStyles.action}><Text style={styles.buttonText}>Done</Text></Pressable>
        </View>
        <Text style={reorderStyles.caption}>Hold a handle to drag. Order saves on close.</Text>
        <DraggableFlatList data={order} keyExtractor={(item) => item.id}
          containerStyle={{ flex: 1 }}
          style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}
          autoscrollThreshold={60} autoscrollSpeed={120} activationDistance={8}
          onDragBegin={() => { draggingRef.current = true; setDragging(true); }}
          onDragEnd={({ data }) => { update(data); draggingRef.current = false; setDragging(false); }}
          renderItem={({ item, drag, isActive, getIndex }) => {
            const index = getIndex() ?? 0;
            const name = exerciseName(item.exerciseId, item.name);
            return <ScaleDecorator activeScale={1.025}>
              <View style={[reorderStyles.row, isActive && reorderStyles.active]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Drag ${name}`} accessibilityHint="Touch and hold to reorder. Move up and down buttons are also available."
                  onLongPress={() => { if (!draggingRef.current) drag(); }} delayLongPress={180} style={reorderStyles.action}>
                  <WorkoutIcon name="grip" />
                </Pressable>
                <Text style={reorderStyles.name}>{name}</Text>
                {([-1, 1] as const).map((direction) => <Pressable key={direction} accessibilityRole="button"
                  accessibilityLabel={`Move ${name} ${direction === -1 ? "up" : "down"}`}
                  disabled={dragging || (direction === -1 ? index === 0 : index === order.length - 1)}
                  style={[reorderStyles.action, (direction === -1 ? index === 0 : index === order.length - 1) && styles.disabled]}
                  onPress={() => move(index, direction)}><WorkoutIcon name={direction === -1 ? "chevron-up" : "chevron-down"} /></Pressable>)}
              </View>
            </ScaleDecorator>;
          }} />
      </View>
    </GestureHandlerRootView>
  </Modal>;
}
const reorderStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", paddingHorizontal: 16 },
  sheet: { maxHeight: "85%", borderRadius: 12, backgroundColor: colors.paper, width: "100%", maxWidth: 520, alignSelf: "center", padding: 12, gap: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  caption: { color: colors.muted, fontSize: 13, paddingHorizontal: 4, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 60, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper },
  active: { backgroundColor: "#DCE3D2" },
  name: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "500", color: colors.ink, paddingVertical: 10 },
  action: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
});
