"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";

export const BackgroundBeams = ({ className }) => {
  return (
    <div
      className={cn(
        "absolute inset-0 h-full w-full bg-transparent overflow-hidden",
        className
      )}
    >
      <div
        style={{
          backgroundImage: `linear-gradient(to right, #6366f1 1px, transparent 1px), linear-gradient(to bottom, #6366f1 1px, transparent 1px)`,
          backgroundSize: "4rem 4rem",
          maskImage: "radial-gradient(ellipse 80% 50% at 50% 0%, #000 70%, transparent 110%)",
        }}
        className="absolute inset-0 h-full w-full opacity-[0.05] pointer-events-none"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="absolute inset-x-0 -bottom-20 z-10 h-full w-full bg-gradient-to-t from-gray-900 via-gray-900/10 to-transparent"
      />
    </div>
  );
};
