import type { Variants } from "motion/react";

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};
