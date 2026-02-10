// app/components/Trust.js
'use client';

import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

export default function Trust() {
  const credibilityItems = [
    {
      title: 'Designed for Indian Academic Institutions',
      description: 'Built with understanding of UGC guidelines, variable working days (4/5/6), and specific academic constraints.',
    },
    {
      title: 'Constraint-Based Optimization',
      description: 'Advanced algorithms handle complex constraints including batch-wise lab scheduling and resource allocation.',
    },
    {
      title: 'Human-in-the-Loop Control',
      description: 'Faculty and administrators maintain oversight with approval workflows and override capabilities.',
    },
    {
      title: 'Agentic Architecture',
      description: 'Research-grade multi-agent system for distributed decision making and intelligent coordination.',
    },
  ];

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
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <section id="trust" className="bg-gray-900 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl bg-gradient-to-br from-indigo-900/30 to-purple-900/30 p-8 sm:p-12 border border-indigo-500/20 backdrop-blur-sm"
        >
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Research-Grade Credibility
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-300">
              SamayVidya combines academic rigor with practical implementation for institutional trust
            </p>
          </div>

          <motion.div 
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mt-12 grid gap-6 sm:grid-cols-2"
          >
            {credibilityItems.map((credibilityItem, index) => (
              <motion.div
                key={index}
                variants={item}
                whileHover={{ y: -5 }}
                className="rounded-xl bg-gray-900/50 p-6 shadow-lg shadow-indigo-500/5 border border-gray-800 transition-all hover:bg-gray-800 hover:border-indigo-500/30 hover:shadow-indigo-500/20"
              >
                <div className="flex items-start">
                  <div className="mr-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/40">
                    <ShieldCheck className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{credibilityItem.title}</h3>
                    <p className="mt-2 text-gray-400">{credibilityItem.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}