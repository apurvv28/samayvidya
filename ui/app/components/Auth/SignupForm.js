'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Phone, Building2, Loader2, Sparkles } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function SignupForm({ onFlip }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Time Table Coordinator', // Fixed role for self-registration
    password: '',
    confirmPassword: '',
    new_department_name: '',
    new_department_code: '',
  });

  // Fetch departments on mount - removed as coordinators create their own department
  useEffect(() => {
    // No longer needed - coordinators always create new departments
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate department name and code
    if (!formData.new_department_name.trim() || !formData.new_department_code.trim()) {
      setError("Please provide both department name and code");
      return;
    }

    setLoading(true);

    try {
      const signupData = {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        phone: formData.phone,
        role: formData.role,
        new_department_name: formData.new_department_name.trim(),
        new_department_code: formData.new_department_code.trim(),
      };

      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Signup failed");
      }

      console.log('[SIGNUP] Registration successful:', data);
      alert("Account created successfully! Please sign in.");
      
      // Redirect to login (flip the card)
      onFlip();

    } catch (err) {
      console.error('[SIGNUP ERROR]', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full relative group">
        <div className="relative w-full h-full bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-center shadow-xl">
            
            <div className="mb-4 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-teal-600" />
                </div>
                <h2 className="text-2xl font-normal text-gray-900 mb-1" style={{ fontFamily: '"Times New Roman", Times, serif' }}>Create Your Department</h2>
                <p className="text-gray-600 text-xs">Register as a coordinator and set up your department</p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs text-center">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">Full Name</label>
                        <div className="relative group/input">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within/input:text-teal-600 transition-colors" />
                            <input 
                            type="text" 
                            name="name"
                            required
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                            placeholder="John Doe"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">Phone</label>
                        <div className="relative group/input">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within/input:text-teal-600 transition-colors" />
                            <input 
                            type="tel" 
                            name="phone"
                            required
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                            placeholder="+91 98765 43210"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative group/input">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within/input:text-teal-600 transition-colors" />
                    <input 
                    type="email" 
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full bg-white border border-gray-300 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                    placeholder="name@example.com"
                    />
                </div>
                </div>

                {/* Department Creation Section */}
                <div className="space-y-2 p-3 bg-teal-50 border border-teal-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-teal-600" />
                        <h3 className="text-sm font-semibold text-teal-700">Department Information</h3>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">
                            Department Name <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            name="new_department_name"
                            value={formData.new_department_name}
                            onChange={handleChange}
                            required
                            placeholder="e.g., Computer Science & AI"
                            className="w-full bg-white border border-gray-300 rounded-xl py-2 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">
                            Department Code <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            name="new_department_code"
                            value={formData.new_department_code}
                            onChange={handleChange}
                            required
                            placeholder="e.g., CSAI"
                            maxLength={10}
                            className="w-full bg-white border border-gray-300 rounded-xl py-2 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all uppercase"
                        />
                        <p className="text-[11px] text-gray-500 ml-1">Short code (max 10 characters, e.g., CS, CSAI, MECH)</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">Password</label>
                        <div className="relative group/input">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within/input:text-teal-600 transition-colors" />
                            <input 
                            type="password" 
                            name="password"
                            required
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full bg-white border border-gray-300 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                            placeholder="Create a password"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider ml-1">Confirm Password</label>
                        <div className="relative group/input">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within/input:text-teal-600 transition-colors" />
                            <input 
                            type="password" 
                            name="confirmPassword"
                            required
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="w-full bg-white border border-gray-300 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
                            placeholder="Confirm password"
                            />
                        </div>
                    </div>
                </div>

                <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full relative overflow-hidden bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 group/btn mt-1 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:animate-shimmer" />
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <span className="relative z-10 flex items-center gap-2 text-sm">
                        Create Department & Register <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                    </span>
                )}
                </motion.button>
            </form>

            <div className="mt-3 text-center pt-3 border-t border-gray-200">
                <p className="text-gray-600 text-xs">
                Already have an account?{' '}
                <button 
                    onClick={onFlip}
                    className="text-teal-600 hover:text-teal-700 font-semibold transition-colors hover:underline underline-offset-4"
                >
                    Log in
                </button>
                </p>
            </div>
        </div>
    </div>
  );
}
