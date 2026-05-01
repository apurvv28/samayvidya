// app/components/Dashboard/DashboardLayout.js
'use client';

import { motion } from 'framer-motion';

export default function DashboardLayout({ children, title, subtitle, icon }) {
  return (
    <div className="min-h-screen bg-white relative">
      {/* Global background pattern - same as landing page */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808020_1px,transparent_1px),linear-gradient(to_bottom,#80808020_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <div className="relative z-[1]">
        <main className="pt-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          {/* Page Header */}
          {title && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <div className="flex items-center gap-4 mb-2">
                {icon && (
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    {icon}
                  </div>
                )}
                <div>
                  <h1 className="text-3xl sm:text-4xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="text-base text-gray-600 mt-1">{subtitle}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
          
          {/* Content */}
          <div className="space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Reusable Card Component
export function DashboardCard({ children, className = '', hover = true }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hover ? { y: -2 } : {}}
      className={`bg-white border-2 border-gray-100 rounded-xl p-6 transition-all ${
        hover ? 'hover:shadow-lg hover:border-gray-200' : ''
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

// Stat Card Component
export function StatCard({ icon, label, value, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    green: 'bg-green-50 border-green-100 text-green-600',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-600',
    red: 'bg-red-50 border-red-100 text-red-600',
    purple: 'bg-purple-50 border-purple-100 text-purple-600',
  };

  return (
    <DashboardCard hover={false}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </DashboardCard>
  );
}

// Button Component
export function DashboardButton({ children, onClick, variant = 'primary', disabled = false, icon, className = '' }) {
  const variants = {
    primary: 'bg-gray-900 text-white hover:bg-gray-800',
    secondary: 'bg-white border-2 border-gray-200 text-gray-900 hover:border-gray-300 hover:bg-gray-50',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent border border-gray-200 text-gray-700 hover:bg-gray-50',
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {icon}
      {children}
    </motion.button>
  );
}

// Badge Component
export function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-gray-100 text-gray-700 border-gray-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${variants[variant]}`}>
      {children}
    </span>
  );
}

// Empty State Component
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}

// Loading State Component
export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}
