import { Keyboard, TextInput } from "react-native";
import type { GestureResponderEvent } from "react-native";

// Observe touches without becoming the responder or covering controls. Checking
// the focused instance again prevents a delayed measurement from blurring a
// different input that the user just tapped.
export function dismissKeyboardOutsideInput(event: GestureResponderEvent) {
  const focused = TextInput.State.currentlyFocusedInput();
  if (!focused) return;
  const { pageX, pageY } = event.nativeEvent;
  focused.measureInWindow((x, y, width, height) => {
    if (TextInput.State.currentlyFocusedInput() !== focused) return;
    if (pageX < x || pageX > x + width || pageY < y || pageY > y + height) Keyboard.dismiss();
  });
}
