import { StyleSheet } from "react-native";
import { colors } from "./styles";
export const manualStyles = StyleSheet.create({
  footer: { paddingHorizontal: 24, paddingVertical: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line, width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: colors.paper },
  input: { backgroundColor: "#FAF9F5", color: colors.ink, borderWidth: 1, borderColor: colors.line, borderRadius: 8, minHeight: 44, padding: 8, fontSize: 16 },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 8 },
  exercise: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, gap: 6 },
  exerciseHeader: { minHeight: 48, justifyContent: "center", gap: 4 },
  set: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 4, gap: 0 },
  setRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  field: { flex: 1, minWidth: 0, gap: 4 },
  check: { width: 48, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.muted, justifyContent: "center", alignItems: "center" },
  checkText: { color: colors.ink, fontSize: 26, fontWeight: "600" },
  saved: { color: "#364831", fontSize: 14, lineHeight: 22 },
});
