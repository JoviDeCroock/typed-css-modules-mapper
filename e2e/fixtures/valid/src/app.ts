import styles, { button, buttonPrimary, fadeIn } from "./button.module.css";
import * as namespace from "./button.module.css";

export const classes: string[] = [
  styles.button,
  styles["button-primary"],
  styles.buttonPrimary,
  styles.fadeIn,
  button,
  buttonPrimary,
  fadeIn,
  namespace.default.button,
];
