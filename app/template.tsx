"use client";
import { motion } from "framer-motion";

/**
 * Global route transition. Opacity-only on purpose — animating `transform`
 * here would create a containing block and break the app shell's
 * `position: fixed` sidebar / sticky topbar / scroll-progress bar.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
