import type { NavigatorScreenParams } from "@react-navigation/native";
import type { TrainStackParamList } from "./training/navigationTypes";

export type Recommendation = "MAINTAIN" | "PUSH" | "RECOVER";
export type TabParamList = {
  Home: {
    score: number;
    recommendation: Recommendation;
    sleep: number | null;
    energy: number | null;
    soreness: number | null;
    intensity: number | null;
  } | undefined;
  Train: NavigatorScreenParams<TrainStackParamList> | undefined;
  Recover: undefined;
  Profile: undefined;
};
export type RootStackParamList = {
  Checkin: undefined;
  Main: NavigatorScreenParams<TabParamList>;
};
