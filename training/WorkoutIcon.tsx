import Svg, { Path } from "react-native-svg";

export default function WorkoutIcon({ name, filled = false }: { name: "chevron-up" | "chevron-down" | "star" | "grip"; filled?: boolean }) {
  const path = name === "chevron-up" ? "m6 15 6-6 6 6" : name === "chevron-down" ? "m6 9 6 6 6-6"
    : name === "star" ? "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"
    : "M5 8h14M5 12h14M5 16h14";
  return <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
    <Path d={path} stroke="#515C5F" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill={filled ? "#B9C9A5" : "none"} />
  </Svg>;
}
