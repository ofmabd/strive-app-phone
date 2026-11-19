import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SetType, WorkoutSet } from "./types";
import { SET_TYPES, setType } from "./setTypes";
import { styles } from "./styles";
export function SetBadge({ set, label, compact = false }: { set: WorkoutSet; label: string; compact?: boolean }) {
  const kind = SET_TYPES.find((item) => item.value === setType(set))!;
  return <View style={[badgeStyles.badge, compact && { minWidth: 44, minHeight: 44 }, { backgroundColor: kind.background }]}>
    <Text style={[styles.buttonText, { color: kind.color }]}>{label}</Text>
  </View>;
}
export default function SetTypeControl({ set, label, disabled, onChange, onDelete, revealDelete, compact = false }: {
  set: WorkoutSet; label: string; disabled: boolean; onChange: (type: SetType) => void; onDelete?: () => void; revealDelete?: () => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = SET_TYPES.find((item) => item.value === setType(set))!;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${kind.name} set ${label}. Change set type`}
      accessibilityHint="Hold to reveal Delete. Screen reader actions also offer Delete set."
      accessibilityActions={onDelete ? [{ name: "delete", label: "Delete set" }] : undefined}
      onAccessibilityAction={(event) => { if (!disabled && event.nativeEvent.actionName === "delete") onDelete?.(); }}
      disabled={disabled} onLongPress={revealDelete} onPress={() => { Keyboard.dismiss(); setOpen(true); }}>
      <SetBadge set={set} label={label} compact={compact} />
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={badgeStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close set types" onPress={() => setOpen(false)} />
        <ScrollView style={badgeStyles.scroll} contentContainerStyle={badgeStyles.sheet} accessibilityViewIsModal>
        <Text style={styles.heading} accessibilityRole="header">Set type</Text>
        {SET_TYPES.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: setType(set) === item.value, disabled }} disabled={disabled}
          style={[styles.option, { backgroundColor: item.background }]} onPress={() => { onChange(item.value); setOpen(false); }}>
          <Text style={[styles.buttonText, { color: item.color }]}>{item.mark ? `${item.mark} · ` : ""}{item.name}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Cancel</Text></Pressable>
      </ScrollView></View>
    </Modal>
  </>;
}
const badgeStyles = StyleSheet.create({
  badge: { minWidth: 48, minHeight: 48, borderRadius: 6, justifyContent: "center", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  scroll: { maxHeight: "90%", width: "100%", maxWidth: 480, alignSelf: "center" },
  sheet: { padding: 20, gap: 12, backgroundColor: "#F2F0EA", borderRadius: 12, maxWidth: 480, width: "100%", alignSelf: "center" },
});
