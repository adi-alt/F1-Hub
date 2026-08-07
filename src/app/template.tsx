"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// template.tsx remounts on every navigation (unlike layout.tsx, which persists) — Next's own
// hook for a per-page transition, so no need to fight the router with AnimatePresence.
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
