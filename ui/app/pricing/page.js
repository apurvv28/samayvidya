// app/pricing/page.js
'use client';

import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Link from 'next/link';

export default function PricingPage() {
  const plans = [
    {
      name: 'Trial',
      price: 'Free',
      period: 'One-time',
      description: 'Perfect for testing the system',
      features: [
        { text: '1 Timetable Generation', included: true },
        { text: 'Max 10 Faculties', included: true },
        { text: 'Max 2 Divisions', included: true },
        { text: 'Max 5 Classrooms & Labs', included: true },
        { text: 'Email Support', included: true },
        { text: 'Advanced Analytics', included: false },
        { text: 'Priority Support', included: false },
        { text: 'Custom Integrations', included: false },
      ],
      cta: 'Start Free Trial',
      popular: false,
    },
    {
      name: 'Institution Pro',
      price: '₹8,999',
      period: 'per year',
      description: 'Ideal for growing institutions',
      features: [
        { text: 'Max 8 Timetable Generations', included: true },
        { text: 'Unlimited Faculties', included: true },
        { text: 'Unlimited Divisions', included: true },
        { text: 'Unlimited Classrooms & Labs', included: true },
        { text: 'Email & Chat Support', included: true },
        { text: 'Advanced Analytics', included: true },
        { text: 'Priority Support', included: false },
        { text: 'Custom Integrations', included: false },
      ],
      cta: 'Get Started',
      popular: true,
    },
    {
      name: 'Institution Max',
      price: '₹15,999',
      period: 'per year',
      description: 'Complete solution for large institutions',
      features: [
        { text: 'Unlimited Timetable Generations', included: true },
        { text: 'Unlimited Faculties', included: true },
        { text: 'Unlimited Divisions', included: true },
        { text: 'Unlimited Classrooms & Labs', included: true },
        { text: 'Email, Chat & Phone Support', included: true },
        { text: 'Advanced Analytics', included: true },
        { text: 'Priority Support', included: true },
        { text: 'Custom Integrations', included: true },
      ],
      cta: 'Contact Sales',
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-white relative">
      {/* Global background pattern */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808020_1px,transparent_1px),linear-gradient(to_bottom,#80808020_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <div className="relative z-[1]">
        <Navbar />
        
        <main className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-gray-900 mb-2" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                Simple, Transparent
              </h1>
              <h1 className="text-3xl sm:text-4xl font-bold italic bg-gradient-to-r from-teal-600 to-teal-600 bg-clip-text text-transparent mb-4" style={{ fontFamily: 'Georgia, serif' }}>
                Pricing
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600">
                Choose the perfect plan for your institution's needs
              </p>
            </motion.div>

            {/* Pricing Cards */}
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {plans.map((plan, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative rounded-2xl border-2 ${
                    plan.popular
                      ? 'border-teal-500 shadow-xl'
                      : 'border-gray-200 shadow-sm'
                  } bg-white p-8 hover:shadow-lg transition-all`}
                >
                  {/* Popular Badge */}
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center px-4 py-1 rounded-full bg-teal-500 text-white text-xs font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {plan.description}
                    </p>
                    <div className="mb-2">
                      <span className="text-4xl font-bold text-gray-900">
                        {plan.price}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{plan.period}</p>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        {feature.included ? (
                          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-sm ${
                            feature.included ? 'text-gray-700' : 'text-gray-400'
                          }`}
                        >
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <Link
                    href="/auth"
                    className={`block w-full text-center px-6 py-3 rounded-xl font-semibold transition-all ${
                      plan.popular
                        ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg hover:shadow-xl'
                        : 'bg-white border-2 border-gray-200 text-gray-900 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* FAQ or Additional Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-16 text-center"
            >
              <p className="text-sm text-gray-600">
                Need a custom plan?{' '}
                <a href="#contact" className="text-teal-600 font-semibold hover:text-teal-700">
                  Contact us
                </a>{' '}
                for enterprise solutions
              </p>
            </motion.div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
