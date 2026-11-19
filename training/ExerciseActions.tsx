import { useRef, useState } from "react";
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { styles } from "./styles";
export default function ExerciseActions({ name, disabled, reorder, remove }: {
  name: string; disabled: boolean; reorder: () => void; remove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const afterDismiss = useRef<(() => void) | null>(null);
  function closeThen(action: () => void) {
    // iOS cannot present another sheet while this native Modal is dismissing.
    if (Platform.OS === "ios") afterDismiss.current = action;
    setOpen(false);
    if (Platform.OS !== "ios") action();
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${name}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }} onPress={() => { Keyboard.dismiss(); setConfirmRemove(false); setOpen(true); }}><Text style={styles.heading}>···</Text></Pressable>
    <Modal transparent visible={open} onRequestClose={() => setOpen(false)} animationType="fade"
      onDismiss={() => { const action = afterDismiss.current; afterDismiss.current = null; action?.(); }}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.4)" }}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close exercise actions" onPress={() => setOpen(false)} />
        <ScrollView style={{ maxHeight: "85%", width: "100%", maxWidth: 480, alignSelf: "center" }} contentContainerStyle={{ backgroundColor: "#F2F0EA", padding: 20, borderRadius: 12, gap: 12 }} accessibilityViewIsModal>
          <Text style={styles.heading} accessibilityRole="header">{name}</Text>
          {!confirmRemove && <Pressable accessibilityRole="button" disabled={disabled} style={styles.option}
            onPress={() => closeThen(reorder)}><Text style={styles.buttonText}>Reorder exercises</Text></Pressable>}
          {confirmRemove && <Text style={styles.body}>Remove this exercise and its sets?</Text>}
          <Pressable accessibilityRole="button" disabled={disabled} style={styles.option} onPress={() => { if (!confirmRemove) setConfirmRemove(true); else closeThen(remove); }}><Text style={styles.buttonText}>{confirmRemove ? "Confirm removal" : "Remove exercise"}</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Cancel</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
