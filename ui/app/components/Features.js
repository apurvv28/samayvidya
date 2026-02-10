// app/components/Features.js
'use client';

import { motion } from 'framer-motion';
import { Network, RefreshCw, Users, FileText } from 'lucide-react';

export default function Features() {
  const features = [
    {
      title: 'Agent-Orchestrated Scheduling',
      description: 'Multi-agent system coordinates timetable generation with specialized agents for faculty, rooms, and curriculum constraints.',
      icon: <Network className="h-6 w-6 text-indigo-600" />,
    },
    {
      title: 'Incremental Replanning',
      description: 'Dynamically adapts to changes in faculty availability, campus events, and resource constraints without complete regeneration.',
      icon: <RefreshCw className="h-6 w-6 text-indigo-600" />,
    },
    {
      title: 'Faculty & Resource Awareness',
      description: 'Real-time tracking of faculty availability, lab resources, and infrastructure constraints with intelligent conflict resolution.',
      icon: <Users className="h-6 w-6 text-indigo-600" />,
    },
    {
      title: 'Versioned & Auditable Timetables',
      description: 'Complete audit trail with version history, change tracking, and approval workflows for institutional compliance.',
      icon: <FileText className="h-6 w-6 text-indigo-600" />,
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
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <section id="features" className="bg-gray-900 py-16 sm:py-24 relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Intelligent Features for Academic Excellence
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            Designed to handle the complexity of Indian academic institutions with research-grade precision
          </p>
        </motion.div>
        
        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={item}
              whileHover={{ 
                y: -5, 
                boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1), 0 0 20px rgba(99, 102, 241, 0.1)",
                borderColor: "rgba(99, 102, 241, 0.4)"
              }}
              className="group relative rounded-xl border border-gray-800 bg-gray-800/50 backdrop-blur-sm p-6 transition-all duration-300"
            >
              <div className="mb-4 inline-flex rounded-lg bg-indigo-500/10 p-3 ring-1 ring-inset ring-indigo-500/20 transition-colors group-hover:bg-indigo-500/20 group-hover:ring-indigo-500/40">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">{feature.title}</h3>
              <p className="mt-3 text-gray-400 group-hover:text-gray-300 transition-colors">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}