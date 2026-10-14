import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/seo";

// The page is a client component, which can't export metadata: it lives here instead.
export const metadata: Metadata = pageMetadata({ title: "Reset password", description: "Set a new password for your Apex F1 Hub account.", path: "/auth/reset-password", index: false });

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
