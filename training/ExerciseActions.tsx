import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { styles } from "./styles";
export default function ExerciseActions({ name, disabled, first, last, move, remove }: {
  name: string; disabled: boolean; first: boolean; last: boolean; move: (direction: -1 | 1) => void; remove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${name}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }} onPress={() => { setConfirmRemove(false); setOpen(true); }}><Text style={styles.heading}>···</Text></Pressable>
    <Modal transparent visible={open} onRequestClose={() => setOpen(false)} animationType="fade">
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.4)" }}>
        <ScrollView style={{ maxHeight: "85%", width: "100%", maxWidth: 480, alignSelf: "center" }} contentContainerStyle={{ backgroundColor: "#F2F0EA", padding: 20, borderRadius: 12, gap: 12 }} accessibilityViewIsModal>
          <Text style={styles.heading} accessibilityRole="header">{name}</Text>
          {!confirmRemove && ([-1, 1] as const).map((direction) => {
            const unavailable = disabled || (direction === -1 ? first : last);
            return <Pressable key={direction} accessibilityRole="button" accessibilityState={{ disabled: unavailable }} disabled={unavailable} style={[styles.option, unavailable && styles.disabled]}
              onPress={() => { move(direction); setOpen(false); }}><Text style={styles.buttonText}>Move {direction === -1 ? "up" : "down"}</Text></Pressable>;
          })}
          {confirmRemove && <Text style={styles.body}>Remove this exercise and its sets?</Text>}
          <Pressable accessibilityRole="button" disabled={disabled} style={styles.option} onPress={() => { if (!confirmRemove) setConfirmRemove(true); else { remove(); setOpen(false); } }}><Text style={styles.buttonText}>{confirmRemove ? "Confirm removal" : "Remove exercise"}</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Cancel</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
