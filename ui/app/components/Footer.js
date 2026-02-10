// app/components/Footer.js
'use client';

import { motion } from 'framer-motion';

export default function Footer() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4"
        >
          {/* Brand */}
          <motion.div variants={item}>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-white bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">SamayVidya</span>
              <span className="mt-2 text-sm text-gray-400">
                Agentic Academic Timetable Management Framework
              </span>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              Research-grade scheduling intelligence for Indian academic institutions.
            </p>
          </motion.div>

          {/* Documentation Links */}
          <motion.div variants={item}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
              Documentation
            </h3>
            <ul className="mt-4 space-y-2">
              {['Architecture Whitepaper', 'API Reference', 'Implementation Guide'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-gray-400 hover:text-indigo-400 transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Resource Links */}
          <motion.div variants={item}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
              Resources
            </h3>
            <ul className="mt-4 space-y-2">
              {['GitHub Repository', 'Research Papers', 'Case Studies'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-gray-400 hover:text-indigo-400 transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div variants={item} id="contact">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
              Contact
            </h3>
            <ul className="mt-4 space-y-2">
              <li className="text-sm text-gray-400">
                For Institutional Inquiries
              </li>
              <li>
                <a href="mailto:institutions@samayvidya.ai" className="text-sm text-gray-400 hover:text-indigo-400 transition-colors">
                  institutions@samayvidya.ai
                </a>
              </li>
              <li className="mt-4 text-sm text-gray-400">
                For Research Collaboration
              </li>
              <li>
                <a href="mailto:research@samayvidya.ai" className="text-sm text-gray-400 hover:text-indigo-400 transition-colors">
                  research@samayvidya.ai
                </a>
              </li>
            </ul>
          </motion.div>
        </motion.div>

        {/* Bottom */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-12 border-t border-gray-800 pt-8"
        >
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} SamayVidya. Agentic Academic Timetable Management Framework.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}