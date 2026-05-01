// app/components/ScrollingMarquee.js
'use client';

import { motion } from 'framer-motion';

export default function ScrollingMarquee() {
  const activities = [
    'Constraint Solving',
    'Faculty Scheduling',
    'Room Allocation',
    'Conflict Resolution',
    'Real-time Updates',
    'Agent Coordination',
    'Timetable Generation',
    'Resource Optimization',
    'Leave Management',
    'Event Detection',
    'Incremental Planning',
    'Notification System',
    'Version Control',
    'Audit Tracking',
    'Preference Matching',
    'Load Balancing',
    'Schedule Validation',
    'Compliance Checking',
    'Multi-Agent System',
    'Dynamic Replanning'
  ];

  return (
    <div className="relative py-6 overflow-hidden border-y border-gray-200 bg-gradient-to-r from-gray-50 via-white to-gray-50">
      <div className="flex">
        {/* First set */}
        <motion.div
          className="flex gap-8 whitespace-nowrap pr-8"
          animate={{ x: [0, -1920] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {activities.map((activity, i) => (
            <span key={i} className="text-sm font-medium text-gray-400">
              {activity}
            </span>
          ))}
        </motion.div>
        
        {/* Second set for seamless loop */}
        <motion.div
          className="flex gap-8 whitespace-nowrap pr-8"
          animate={{ x: [0, -1920] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {activities.map((activity, i) => (
            <span key={`dup-${i}`} className="text-sm font-medium text-gray-400">
              {activity}
            </span>
          ))}
        </motion.div>

        {/* Third set for extra coverage */}
        <motion.div
          className="flex gap-8 whitespace-nowrap pr-8"
          animate={{ x: [0, -1920] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {activities.map((activity, i) => (
            <span key={`dup2-${i}`} className="text-sm font-medium text-gray-400">
              {activity}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
