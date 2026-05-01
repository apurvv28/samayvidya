// app/components/Features.js
'use client';

import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Network, RefreshCw, Users, FileText } from 'lucide-react';
import { useState } from 'react';

export default function Features() {
  const features = [
    {
      title: 'Agent-Orchestrated Scheduling',
      description: 'Multi-agent system coordinates timetable generation with specialized agents for faculty, rooms, and curriculum constraints.',
      icon: <Network className="h-6 w-6 text-gray-900" />,
      stats: { value: '2.4M', label: 'schedules generated' }
    },
    {
      title: 'Incremental Replanning',
      description: 'Dynamically adapts to changes in faculty availability, campus events, and resource constraints without complete regeneration.',
      icon: <RefreshCw className="h-6 w-6 text-gray-900" />,
      stats: { value: '98.2%', label: 'conflict resolution' }
    },
    {
      title: 'Faculty & Resource Awareness',
      description: 'Real-time tracking of faculty availability, lab resources, and infrastructure constraints with intelligent conflict resolution.',
      icon: <Users className="h-6 w-6 text-gray-900" />,
      stats: { value: '3.2s', label: 'avg response time' }
    },
    {
      title: 'Versioned & Auditable Timetables',
      description: 'Complete audit trail with version history, change tracking, and approval workflows for institutional compliance.',
      icon: <FileText className="h-6 w-6 text-gray-900" />,
      stats: { value: '99.9%', label: 'uptime' }
    },
  ];

  return (
    <section id="features" className="relative py-12 sm:py-16 overflow-hidden">
      
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-gray-900 mb-2" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            Intelligent Features for
          </h2>
          <h2 className="text-3xl sm:text-4xl font-bold italic bg-gradient-to-r from-teal-600 to-teal-600 bg-clip-text text-transparent mb-4" style={{ fontFamily: 'Georgia, serif' }}>
            Academic Excellence
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">
            Designed to handle the complexity of Indian academic institutions with research-grade precision
          </p>
        </motion.div>
        
        {/* Bento grid layout */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }) {
  const [isHovered, setIsHovered] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const rotateX = useTransform(y, [-100, 100], [5, -5]);
  const rotateY = useTransform(x, [-100, 100], [-5, 5]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className="group relative rounded-2xl border border-gray-200 bg-white p-8 transition-all duration-300 hover:shadow-2xl hover:border-gray-300"
    >
      {/* Gradient overlay on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-50 to-indigo-50 opacity-0 transition-opacity duration-300"
        animate={{ opacity: isHovered ? 0.5 : 0 }}
      />
      
      <div className="relative" style={{ transform: "translateZ(20px)" }}>
        <motion.div 
          className="mb-5 inline-flex rounded-xl bg-gray-100 p-3 transition-all duration-300 group-hover:bg-teal-100 group-hover:scale-110"
          whileHover={{ rotate: [0, -10, 10, -10, 0] }}
          transition={{ duration: 0.5 }}
        >
          {feature.icon}
        </motion.div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
        <p className="text-gray-600 leading-relaxed mb-6">{feature.description}</p>
        
        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0.7 }}
          className="flex items-baseline gap-2 pt-4 border-t border-gray-100"
        >
          <span className="text-2xl font-bold text-gray-900">{feature.stats.value}</span>
          <span className="text-sm text-gray-500">{feature.stats.label}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
