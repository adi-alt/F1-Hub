/** The window event the Apex launcher listens for: any surface can open Apex with a question already asked, without
 * a second chat of its own. */
export const APEX_ASK_EVENT = "apex:ask";

/** Opens Apex and asks `question`. `reach: "everything"` asks it as a general F1 question (a race, a driver) rather
 * than one about the current page; the default answers in the page's own scope. */
export function askApex(question?: string, reach?: "page" | "everything") {
  window.dispatchEvent(new CustomEvent(APEX_ASK_EVENT, { detail: { question, reach } }));
}

/** Opens Apex on a conversation already had elsewhere (the command palette's "Continue in Apex"), asked across the
 * whole site, so the next question follows on from it. */
export function continueInApex(transcript: { role: "user" | "assistant"; content: string }[]) {
  window.dispatchEvent(new CustomEvent(APEX_ASK_EVENT, { detail: { transcript, reach: "everything" } }));
}
