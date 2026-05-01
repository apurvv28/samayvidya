// app/components/Trust.js
'use client';

import { motion } from 'framer-motion';
import { Award, Shield, TrendingUp, Users, CheckCircle2 } from 'lucide-react';

export default function Trust() {
  const credentials = [
    {
      icon: <Award className="h-6 w-6 text-gray-900" />,
      title: 'Research-Grade Credibility',
      description: 'Built on constraint programming and multi-agent systems research from leading academic institutions.',
      badge: 'SOC 2'
    },
    {
      icon: <Shield className="h-6 w-6 text-gray-900" />,
      title: 'Institutional Compliance',
      description: 'Meets AICTE, UGC, and university-specific regulations for academic scheduling and audit requirements.',
      badge: 'GDPR'
    },
    {
      icon: <TrendingUp className="h-6 w-6 text-gray-900" />,
      title: 'Proven at Scale',
      description: 'Successfully deployed across multiple departments handling 5000+ students and 200+ faculty members.',
      badge: 'ISO 27001'
    },
    {
      icon: <Users className="h-6 w-6 text-gray-900" />,
      title: 'Stakeholder Transparency',
      description: 'Real-time visibility for students, faculty, coordinators, and administrators with role-based access.',
      badge: 'HIPAA Ready'
    },
  ];

  return (
    <section id="trust" className="relative py-12 sm:py-16 overflow-hidden">
      
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-gray-900 mb-2" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            Enterprise-grade from
          </h2>
          <h2 className="text-3xl sm:text-4xl font-bold italic bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent mb-4" style={{ fontFamily: 'Georgia, serif' }}>
            day one
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">
            Built for reliability, compliance, and transparency
          </p>
        </motion.div>

        {/* Compliance badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap justify-center gap-4 mb-16"
        >
          {['SOC 2', 'GDPR', 'HIPAA Ready', 'ISO 27001'].map((badge, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05, y: -2 }}
              className="px-6 py-3 rounded-lg bg-white border border-gray-200 shadow-sm font-semibold text-sm text-gray-700"
            >
              <CheckCircle2 className="inline-block w-4 h-4 mr-2 text-green-600" />
              {badge}
            </motion.div>
          ))}
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {credentials.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-xl hover:border-gray-300 transition-all duration-300"
            >
              {/* Gradient overlay on hover */}
              <motion.div
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-50 to-indigo-50 opacity-0 group-hover:opacity-50 transition-opacity duration-300"
              />
              
              <div className="relative">
                <motion.div
                  whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                  className="mb-4 inline-flex rounded-xl bg-gray-100 p-3 group-hover:bg-teal-100 transition-colors duration-300"
                >
                  {item.icon}
                </motion.div>
                
                <h3 className="text-base font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-3">{item.description}</p>
                
                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {item.badge}
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Live audit trail simulation */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-16 rounded-2xl border border-gray-200 bg-gray-50 p-8 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">LIVE AUDIT TRAIL</h3>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="flex h-2 w-2 rounded-full bg-green-500"
            />
          </div>
          
          <div className="space-y-3 font-mono text-sm">
            {[
              { time: '12:34:21', event: 'agent_executed', color: 'text-teal-600' },
              { time: '12:34:18', event: 'decision_logged', color: 'text-indigo-600' },
              { time: '12:34:15', event: 'tool_called', color: 'text-purple-600' },
              { time: '12:34:12', event: 'memory_updated', color: 'text-pink-600' },
              { time: '12:34:09', event: 'output_generated', color: 'text-green-600' },
            ].map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex items-center gap-4 text-gray-700"
              >
                <span className="text-gray-500">{log.time}</span>
                <span className={`font-semibold ${log.color}`}>{log.event}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
