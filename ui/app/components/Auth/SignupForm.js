'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Phone, Building2, Loader2 } from 'lucide-react';

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
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-500 rounded-2xl opacity-75 blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative w-full h-full bg-gray-900 border border-white/10 rounded-2xl p-8 flex flex-col justify-center shadow-2xl backdrop-blur-xl">
            
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">Create Your Department</h2>
                <p className="text-gray-400 text-sm">Register as a coordinator and set up your department</p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Full Name</label>
                        <div className="relative group/input">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <input 
                            type="text" 
                            name="name"
                            required
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                            placeholder="John Doe"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Phone</label>
                        <div className="relative group/input">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <input 
                            type="tel" 
                            name="phone"
                            required
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                            placeholder="+91 98765 43210"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative group/input">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                    <input 
                    type="email" 
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                    placeholder="name@example.com"
                    />
                </div>
                </div>

                {/* Department Creation Section */}
                <div className="space-y-3 p-4 bg-indigo-900/10 border border-indigo-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-indigo-400" />
                        <h3 className="text-sm font-semibold text-indigo-300">Department Information</h3>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                            Department Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            name="new_department_name"
                            value={formData.new_department_name}
                            onChange={handleChange}
                            required
                            placeholder="e.g., Computer Science & AI"
                            className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-2.5 px-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                            Department Code <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            name="new_department_code"
                            value={formData.new_department_code}
                            onChange={handleChange}
                            required
                            placeholder="e.g., CSAI"
                            maxLength={10}
                            className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-2.5 px-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner uppercase"
                        />
                        <p className="text-xs text-gray-500 ml-1">Short code (max 10 characters, e.g., CS, CSAI, MECH)</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Password</label>
                        <div className="relative group/input">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <input 
                            type="password" 
                            name="password"
                            required
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                            placeholder="Create a password"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Confirm Password</label>
                        <div className="relative group/input">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <input 
                            type="password" 
                            name="confirmPassword"
                            required
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
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
                className="w-full relative overflow-hidden bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group/btn mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
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

            <div className="mt-4 text-center pt-4 border-t border-white/5">
                <p className="text-gray-500 text-sm">
                Already have an account?{' '}
                <button 
                    onClick={onFlip}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors hover:underline underline-offset-4"
                >
                    Log in
                </button>
                </p>
            </div>
        </div>
    </div>
  );
}
