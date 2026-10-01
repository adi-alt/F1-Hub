"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Alert } from "./Alert";
import { Button } from "./Button";

/**
 * A page that rendered with some of its data missing (spec §9.3: partial data, never a failed
 * page; audit FEAT-06). Try again re-renders the page's Server Components with fresh reads and
 * keeps everything on screen until they arrive. `className` is for layout only.
 */
export function RefreshAlert({
  title = "Some of this page couldn't be loaded",
  children = "What loaded is shown below. Try again to fetch the rest.",
  className,
}: {
  title?: string;
  children?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Alert
      tone="warning"
      title={title}
      className={className}
      action={
        <Button variant="secondary" size="sm" loading={pending} onClick={() => startTransition(() => router.refresh())}>
          Try again
        </Button>
      }
    >
      {children}
    </Alert>
  );
}
