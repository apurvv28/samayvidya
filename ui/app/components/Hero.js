// app/components/Hero.js
'use client';

import { motion } from 'framer-motion';
import TimetablePreview from './TimetablePreview';

export default function Hero() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-gray-900 via-indigo-950 to-gray-900 pt-20 pb-16 sm:pt-24 sm:pb-32 min-h-screen flex items-center">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
          
          {/* Text Content */}
          <motion.div 
            className="text-center lg:text-left mb-12 lg:mb-0"
            variants={container}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={item} className="mb-8 inline-flex items-center rounded-full bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/20 backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-indigo-400 mr-2 animate-pulse"></span>
              Agentic AI
            </motion.div>
            
            <motion.h1 variants={item} className="text-4xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
              <span className="block mb-2 text-gray-200">Agentic Intelligence for</span>
              <span className="block bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent bg-300% animate-gradient pb-2">
                Dynamic Academic Timetabling
              </span>
            </motion.h1>
            
            {/* <motion.p variants={item} className="mx-auto lg:mx-0 mt-6 max-w-2xl text-lg leading-8 text-gray-300">
              An event-driven multi-agent orchestration framework that dynamically generates and adapts academic timetables with constraint-based optimization, designed specifically for the Indian education system.
            </motion.p> */}
            
            <motion.div variants={item} className="mt-10 flex flex-col items-center lg:items-start justify-center lg:justify-start gap-4 sm:flex-row">
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="/auth"
                className="rounded-lg bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/50"
              >
                Get Started
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="#contact"
                className="rounded-lg border border-gray-700 bg-white/5 backdrop-blur-sm px-8 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-white/10 hover:border-gray-600"
              >
                Contact Us
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Timetable Preview */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="relative lg:h-full flex items-center justify-center"
          >
             <TimetablePreview />
          </motion.div>

        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]" aria-hidden="true">
        <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}></div>
      </div>
    </section>
  );
}