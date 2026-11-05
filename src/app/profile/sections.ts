export type AccountSection = "personalisation" | "predictions" | "saved" | "notifications" | "profile" | "account";

export const ACCOUNT_SECTIONS: { value: AccountSection; label: string }[] = [
  { value: "personalisation", label: "Personalisation" },
  { value: "predictions", label: "Predictions" },
  { value: "saved", label: "Saved" },
  { value: "notifications", label: "Notifications" },
  { value: "profile", label: "Profile" },
  { value: "account", label: "Account" },
];

export const accountHref = (section: AccountSection) => `/profile/${section}`;

export function sectionFromPathname(pathname: string | null): AccountSection {
  if (!pathname) return "personalisation";
  const seg = pathname.split("/").filter(Boolean)[1];
  return ACCOUNT_SECTIONS.some((s) => s.value === seg) ? (seg as AccountSection) : "personalisation";
}
