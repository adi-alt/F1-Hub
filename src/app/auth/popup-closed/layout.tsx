import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// The page is a client component, which can't export metadata: it lives here instead.
export const metadata: Metadata = pageMetadata({ title: "Signing in", description: "Finishing your sign-in to Apex F1 Hub.", path: "/auth/popup-closed", index: false });

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
