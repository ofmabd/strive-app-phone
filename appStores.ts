import AsyncStorage from "@react-native-async-storage/async-storage";
import { createScoreStore } from "./scoreStorage";
import { createTrainingStore } from "./training/storage";

// All screens share these queues; never instantiate per screen or render.
export const scoreStore = createScoreStore(AsyncStorage);
export const trainingStore = createTrainingStore(AsyncStorage);
