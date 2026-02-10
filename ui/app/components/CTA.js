// app/components/CTA.js
'use client';

import { motion, useMotionTemplate, useMotionValue, animate } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';
import { BackgroundBeams } from './ui/BackgroundBeams';

function Button({ children, href }) {
  return (
    <motion.a
      href={href}
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition-transform active:scale-95 shadow-[0_0_20px_-5px_rgba(255,255,255,0.5)] hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.6)]"
      whileHover={{ scale: 1.05 }}
    >
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200/50 to-transparent translate-x-[-100%] group-hover:animate-shimmer" />
      <span className="relative z-10 flex items-center gap-2">
        {children}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </motion.a>
  );
}

function BorderBeam({ duration = 10, delay = 0 }) {
  return (
    <motion.div
      initial={{ offsetDistance: "0%" }}
      animate={{ offsetDistance: "100%" }}
      transition={{
        duration,
        ease: "linear",
        repeat: Infinity,
        delay,
      }}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        offsetPath: `rect(0% auto 100% auto round 24px)`,
      }}
    >
        <div className="absolute h-[100px] w-[2px] bg-gradient-to-b from-transparent via-indigo-500 to-transparent" />
    </motion.div>
  );
}


export default function CTA() {
  return (
    <section className="relative overflow-hidden bg-gray-900 py-24 sm:py-32">
        <div className="absolute inset-0 bg-gray-900">
            <BackgroundBeams className="opacity-40" />
        </div>
      
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative isolate overflow-hidden rounded-3xl bg-gray-900/80 px-6 py-24 shadow-2xl sm:rounded-3xl sm:px-24 xl:py-32 border border-white/5 backdrop-blur-sm group"
        >
          {/* Moving Gradient Border Effect */}
           <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
           
          {/* Spotlight/Glow behind text */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />

          <div className="mx-auto max-w-2xl text-center relative z-20">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8 flex justify-center"
            >
              <div className="relative rounded-full px-4 py-1.5 text-sm leading-6 text-gray-300 ring-1 ring-white/10 hover:ring-white/20 bg-white/5 backdrop-blur-md transition-all hover:bg-white/10">
                <span className="inline-flex items-center gap-x-2">
                  <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
                  <span className="font-semibold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Next Gen</span>
                  <span className="h-4 w-px bg-white/10" />
                  <span className="text-gray-400">SamayVidya</span>
                </span>
              </div>
            </motion.div>

            <motion.h2 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Ready to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-indigo-300">revolutionize</span> <br />
              academic scheduling?
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mx-auto mt-6 max-w-xl text-lg leading-8 text-gray-300/80"
            >
              Join the institutions already leveraging our agentic framework for conflict-free, optimized, and automated timetables.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-10 flex items-center justify-center gap-x-6"
            >
              <Button href="#contact">
                Request Demo
              </Button>
              <a href="#features" className="text-sm font-semibold leading-6 text-white hover:text-indigo-300 transition-colors">
                Learn more <span aria-hidden="true">→</span>
              </a>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}