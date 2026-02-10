// app/components/HowItWorks.js
'use client';

import { motion } from 'framer-motion';

export default function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Canonical Timetable Initialization',
      description: 'Establish baseline timetable with institutional constraints, faculty preferences, and resource allocations.',
    },
    {
      number: '02',
      title: 'Event Detection & Processing',
      description: 'Monitor faculty leave requests, campus events, resource conflicts, and institutional changes in real-time.',
    },
    {
      number: '03',
      title: 'Agent Coordination & Constraint Solving',
      description: 'Specialized agents collaborate to resolve conflicts while maintaining academic integrity and resource optimization.',
    },
    {
      number: '04',
      title: 'Incremental Updates & Notifications',
      description: 'Apply minimal changes to timetable and notify stakeholders while preserving overall schedule stability.',
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <section id="how-it-works" className="bg-gradient-to-b from-gray-900 to-indigo-950 py-16 sm:py-24 overflow-hidden text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            A systematic approach to dynamic timetable management
          </p>
        </motion.div>

        {/* Desktop Steps */}
        <div className="mt-16 hidden lg:block">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-0 right-0 top-8 h-0.5 bg-gray-800">
              <motion.div 
                initial={{ width: 0 }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, delay: 0.2 }}
                className="h-full bg-indigo-500"
              />
            </div>
            
            <motion.div 
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              className="relative grid grid-cols-4 gap-8"
            >
              {steps.map((step, index) => (
                <motion.div variants={item} key={index} className="relative group">
                  <div className="relative z-10 flex flex-col items-center">
                    <motion.div 
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-gray-900 bg-indigo-600 text-xl font-semibold text-white shadow-lg z-10 transition-colors group-hover:bg-indigo-500"
                    >
                      {step.number}
                    </motion.div>
                    <div className="mt-8 text-center">
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">{step.title}</h3>
                      <p className="mt-3 text-gray-400">{step.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Mobile Steps */}
        <div className="mt-16 lg:hidden">
          <motion.div 
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="space-y-8"
          >
            {steps.map((step, index) => (
              <motion.div variants={item} key={index} className="relative">
                <div className="flex">
                  <div className="mr-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white ring-4 ring-gray-900">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-gray-400">{step.description}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className="ml-6 mt-4 h-8 border-l-2 border-dotted border-gray-700" />
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}