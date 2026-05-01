// app/components/CTA.js
'use client';

import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

export default function CTA() {
  const benefits = [
    'Automated conflict resolution',
    'Real-time schedule updates',
    'Faculty preference optimization',
    'Institutional compliance',
  ];

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-50 via-white to-teal-50 px-8 py-20 sm:px-16 lg:px-24 shadow-xl border-2 border-gray-100"
        >
          {/* Inner subtle glow effects */}
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-teal-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
          </div>

          <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-3xl sm:text-4xl font-normal tracking-tight text-gray-900 mb-2" style={{ fontFamily: '"Times New Roman", Times, serif' }}
              >
                Ready to
              </motion.h2>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="text-3xl sm:text-4xl font-bold italic text-gray-900 mb-5" style={{ fontFamily: 'Georgia, serif' }}
              >
                revolutionize academic scheduling?
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="text-base text-gray-600 mb-6"
              >
                Join institutions already leveraging our agentic framework for conflict-free, optimized, and automated timetables.
              </motion.p>

              {/* Benefits list */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="space-y-3 mb-10"
              >
                {benefits.map((benefit, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-gray-300">{benefit}</span>
                  </motion.div>
                ))}
              </motion.div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <motion.a
                  href="#contact"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gray-900 text-white text-base font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  Request Demo
                  <motion.div
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.div>
                </motion.a>

                <motion.a
                  href="#features"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border-2 border-gray-300 bg-white text-gray-900 text-base font-semibold hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  Learn More
                </motion.a>
              </motion.div>
            </div>

            {/* Right Content - Stats */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-6"
            >
              {[
                { value: '3,845', label: 'Active Agents', sublabel: 'Working 24/7' },
                { value: '99.9%', label: 'Uptime', sublabel: 'Guaranteed' },
                { value: '180+', label: 'Institutions', sublabel: 'Worldwide' },
                { value: '2.4M', label: 'Schedules', sublabel: 'Generated' },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="p-5 rounded-2xl bg-white border-2 border-gray-100 hover:border-teal-200 hover:shadow-lg transition-all"
                >
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {stat.value}
                  </div>
                  <div className="text-xs font-semibold text-gray-700 mb-0.5">
                    {stat.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    {stat.sublabel}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
