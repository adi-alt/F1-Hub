// Writes Supabase Auth's two emails (confirm sign-up, reset password) in the site's email design, from the same
// layout every other email uses (src/lib/email/layout.ts), to supabase/email-templates/. Supabase sends these itself,
// so they're pasted into the dashboard: Authentication › Emails › Templates. Run: npx tsx scripts/render-auth-email-templates.ts

import fs from "node:fs";
import { emailOrigin, renderEmail } from "../src/lib/email/layout";

const LINK = "{{ .ConfirmationURL }}";
const write = (name: string, mail: ReturnType<typeof renderEmail>) => {
  // The layout makes site paths absolute; Supabase's placeholder is already a full link.
  const html = mail.html.replaceAll(`${emailOrigin()}${LINK}`, LINK);
  fs.writeFileSync(`supabase/email-templates/${name}.html`, html);
  console.log(`supabase/email-templates/${name}.html  (subject: ${mail.subject})`);
};

write(
  "confirm-signup",
  renderEmail({
    subject: "Confirm your email for Apex F1 Hub",
    preheader: "One click and your account is ready",
    context: { label: "Your account" },
    eyebrow: "Welcome",
    title: "Confirm your email",
    text: "Confirm this address and your Apex F1 Hub account is ready: picks for every Grand Prix, prediction leagues with friends, and every race since 1950.",
    cta: { label: "Confirm email", href: LINK },
    reason: "You got this because someone signed up to Apex F1 Hub with this address. If it wasn't you, ignore it: no account is made without the click.",
  }),
);
write(
  "reset-password",
  renderEmail({
    subject: "Reset your Apex F1 Hub password",
    preheader: "The link works once, for a short time",
    context: { label: "Your account" },
    eyebrow: "Password",
    title: "Reset your password",
    text: "Use the button to choose a new password. The link works once, for a short time.",
    cta: { label: "Choose a new password", href: LINK },
    warning: "Never share this link. Apex F1 Hub will never ask you for it.",
    reason: "Didn't ask to reset your password? Ignore this email; your password stays as it is.",
  }),
);
