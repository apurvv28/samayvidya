// app/components/HowItWorks.js
'use client';

import { motion } from 'framer-motion';
import { Database, Zap, Network, Bell, ArrowRight } from 'lucide-react';

export default function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Canonical Timetable Initialization',
      description: 'System ingests faculty load, room availability, and curriculum structure to generate the baseline timetable using constraint satisfaction.',
      icon: <Database className="h-7 w-7" />,
    },
    {
      number: '02',
      title: 'Event Detection & Processing',
      description: 'Real-time monitoring of faculty leave requests, room bookings, and schedule changes triggers the incremental replanning pipeline.',
      icon: <Zap className="h-7 w-7" />,
    },
    {
      number: '03',
      title: 'Agent Coordination & Constraint Solving',
      description: 'Specialized agents negotiate resource allocation, resolve conflicts, and propose minimal-disruption schedule adjustments.',
      icon: <Network className="h-7 w-7" />,
    },
    {
      number: '04',
      title: 'Incremental Updates & Notifications',
      description: 'Approved changes are versioned, propagated to affected stakeholders, and reflected in student/faculty views instantly.',
      icon: <Bell className="h-7 w-7" />,
    },
  ];

  return (
    <section id="how-it-works" className="relative py-12 sm:py-16 overflow-hidden">

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-gray-900 mb-2" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            How It Works
          </h2>
          <p className="mx-auto max-w-2xl text-base text-gray-600 mt-3">
            From initialization to real-time updates in four intelligent steps
          </p>
        </motion.div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              <motion.div
                whileHover={{ y: -8 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="relative h-full p-8 rounded-2xl bg-white border-2 border-gray-100 hover:border-blue-200 hover:shadow-xl transition-all duration-300"
              >
                {/* Step number badge */}
                <div className="flex items-start gap-6 mb-6">
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg"
                  >
                    {step.number}
                  </motion.div>

                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="flex-shrink-0 w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition-colors"
                  >
                    {step.icon}
                  </motion.div>
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  {step.description}
                </p>

                {/* Arrow indicator */}
                <motion.div
                  className="flex items-center gap-2 text-blue-600 font-medium text-xs"
                  whileHover={{ x: 5 }}
                >
                  Learn more
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.div>

                {/* Hover gradient overlay */}
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                />
              </motion.div>

              {/* Connection line for desktop */}
              {index < steps.length - 1 && index % 2 === 0 && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.8 }}
                  className="hidden md:block absolute top-1/2 -right-6 lg:-right-12 w-6 lg:w-12 h-0.5 bg-gradient-to-r from-blue-300 to-blue-200 origin-left"
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-16 text-center"
        >
          <motion.a
            href="#features"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gray-900 text-white text-base font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Explore All Features
            <ArrowRight className="w-4 h-4" />
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
}
