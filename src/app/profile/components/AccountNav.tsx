import Link from "next/link";

export type AccountSection = "personalisation" | "notifications" | "profile" | "account";

export const ACCOUNT_SECTIONS: { value: AccountSection; label: string }[] = [
  { value: "personalisation", label: "Personalisation" },
  { value: "notifications", label: "Notifications" },
  { value: "profile", label: "Profile" },
  { value: "account", label: "Account" },
];

export const accountHref = (section: AccountSection) => `/?section=profile&tab=${section}`;

/** The account's sections as the site's underline tabs. They're links, not in-page tabs: each section is its own
 * server render (`/?section=profile&tab=`), so Back and a shared link land on the right one. */
export function AccountNav({ current }: { current: AccountSection }) {
  return (
    <nav aria-label="Account sections" className="-mx-1 flex gap-6 overflow-x-auto border-b border-white/[0.06] px-1">
      {ACCOUNT_SECTIONS.map((s) => {
        const on = s.value === current;
        return (
          <Link
            key={s.value}
            href={accountHref(s.value)}
            aria-current={on ? "page" : undefined}
            className={`relative inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-control text-body-sm font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${on ? "text-primary" : "text-secondary hover:text-primary"}`}
          >
            {s.label}
            <span aria-hidden className={`absolute inset-x-0 -bottom-px h-0.5 bg-brand transition-transform duration-base ${on ? "scale-x-100" : "scale-x-0"}`} />
          </Link>
        );
      })}
    </nav>
  );
}
