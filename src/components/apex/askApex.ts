/** The window event the Apex launcher listens for: any surface can open Apex with a question already asked, without
 * a second chat of its own. */
export const APEX_ASK_EVENT = "apex:ask";

/** Opens Apex and asks `question`. `reach: "everything"` asks it as a general F1 question (a race, a driver) rather
 * than one about the current page; the default answers in the page's own scope. */
export function askApex(question?: string, reach?: "page" | "everything") {
  window.dispatchEvent(new CustomEvent(APEX_ASK_EVENT, { detail: { question, reach } }));
}
