import type { ReactNode } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dismissKeyboardOutsideInput } from "./keyboard";

export default function WorkoutSheet({ visible, close, label, children, onDismiss }: {
  visible: boolean; close: () => void; label: string; children: ReactNode; onDismiss?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={close} onDismiss={onDismiss} onShow={Keyboard.dismiss}>
    <View style={[sheetStyles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} onTouchStart={dismissKeyboardOutsideInput}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} style={StyleSheet.absoluteFill} onPress={close} />
      <View style={sheetStyles.panel} accessibilityViewIsModal onAccessibilityEscape={close}>
        <ScrollView style={sheetStyles.scroll} contentContainerStyle={sheetStyles.content} keyboardShouldPersistTaps="always">{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}
const sheetStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", paddingHorizontal: 20 },
  panel: { maxHeight: "85%", width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: "#F2F0EA", borderRadius: 12, flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 }, content: { padding: 16, gap: 12 },
});
