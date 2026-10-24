import * as styles from "./card.module.css";
import { card } from "./card.module.css";

export const classes: string[] = [styles.card, card];
// @ts-expect-error Only names that are identifiers become named exports.
styles["card-title"];
// @ts-expect-error The default export is turned off.
styles.default;
