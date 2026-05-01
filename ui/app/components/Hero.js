// app/components/Hero.js
'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-24 sm:py-28">
        <div className="text-center">
          
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-700 mb-6"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Powered by Agentic AI
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.2] mb-6"
          >
            <span className="block text-gray-900 mb-1 font-normal" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
              Agentic Intelligence for
            </span>
            <motion.span
              className="block bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 bg-clip-text text-transparent font-bold italic"
              animate={{
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              style={{ 
                backgroundSize: '200% 200%',
                fontFamily: 'Georgia, serif'
              }}
            >
              Dynamic Academic Timetabling
            </motion.span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg sm:text-xl text-gray-600 mb-10 max-w-3xl mx-auto font-normal leading-relaxed"
          >
            Transform your institution's scheduling with intelligent agents that handle constraints, conflicts, and changes in real-time.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <motion.a
              href="/auth"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gray-900 text-white text-base font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </motion.a>
            
            <motion.a
              href="#features"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white border-2 border-gray-200 text-gray-900 text-base font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              View Features
            </motion.a>
          </motion.div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      {/* <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" /> */}
    </section>
  );
}
