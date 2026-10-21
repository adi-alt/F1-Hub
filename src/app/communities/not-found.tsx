import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Community not found" };

/** A community link that leads nowhere: deleted, mistyped, or an invitation to one that's gone. Says so, and points
 * back to Communities rather than the site-wide 404's sections. */
export default function CommunityNotFound() {
  return (
    <div className="page-narrow py-16 text-center">
      <p className="text-body-sm text-secondary">
        <span className="tabular font-semibold text-brand-text">404</span> · Community not found
      </p>
      <h1 className="mt-1 text-title-lg font-semibold text-primary">This community doesn&apos;t exist any more.</h1>
      <p className="mx-auto mt-3 max-w-md text-body text-secondary">It may have been deleted, or the link is mistyped. Any invitation to it no longer works.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="md" asChild>
          <Link href="/?section=communities">Back to Communities</Link>
        </Button>
      </div>
    </div>
  );
}
