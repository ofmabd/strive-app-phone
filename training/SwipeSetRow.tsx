import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

export default function SwipeSetRow({ children, disabled, editing, label, onDelete }: {
  children: (revealDelete: () => void) => ReactNode; disabled: boolean; editing: boolean; label: string; onDelete: () => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  useEffect(() => { if (disabled || editing) swipe.current?.close(); }, [disabled, editing]);
  return <ReanimatedSwipeable ref={swipe} enabled={!disabled} hitSlop={editing ? { left: 0, width: 44 } : undefined} friction={2} rightThreshold={36}
    onSwipeableOpenStartDrag={Keyboard.dismiss}
    dragOffsetFromRight={-24} dragOffsetFromLeft={24} overshootRight={false} overshootLeft={false}
    renderRightActions={() => <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${label}`} disabled={disabled}
      style={rowStyles.remove} onPress={onDelete}><Text style={rowStyles.removeText}>Delete</Text></Pressable>}>
    <View style={rowStyles.row}>{children(() => { if (!disabled) { Keyboard.dismiss(); swipe.current?.openRight(); } })}</View>
  </ReanimatedSwipeable>;
}
const rowStyles = StyleSheet.create({
  row: { backgroundColor: "#F2F0EA" },
  remove: { backgroundColor: "#8B302A", minWidth: 76, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  removeText: { color: "#F5F4EF", fontSize: 14, fontWeight: "600" },
});
