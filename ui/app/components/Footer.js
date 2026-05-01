// app/components/Footer.js
'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-2xl font-bold text-gray-900">समयविद्या</span>
            <p className="mt-2 text-sm text-gray-600">
              Academic Timetable Framework
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Research-grade scheduling intelligence for Indian academic institutions.
            </p>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
              Quick Links
            </h3>
            <ul className="space-y-3">
              <li>
                <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <a href="#contact" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            id="contact"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
              Contact
            </h3>
            <ul className="space-y-3">
              <li className="text-sm text-gray-600">
                For Institutional Inquiries
              </li>
              <li>
                <a href="mailto:institutions@samayvidya.ai" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  institutions@samayvidya.ai
                </a>
              </li>
              <li className="mt-4 text-sm text-gray-600">
                For Research Collaboration
              </li>
              <li>
                <a href="mailto:research@samayvidya.ai" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  research@samayvidya.ai
                </a>
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Bottom */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-12 border-t border-gray-200 pt-8"
        >
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} समयविद्या. Academic Timetable Framework.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}
