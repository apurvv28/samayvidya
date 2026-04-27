'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Phone, Building2, Briefcase, Loader2 } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function SignupForm({ onFlip }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department_id: '',
    role: 'Time Table Coordinator',
    password: '',
    confirmPassword: ''
  });

  // Fetch departments on mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/departments`);
        const data = await response.json();
        setDepartments(data.data || []);
      } catch (err) {
        console.error('Failed to fetch departments:', err);
      }
    };

    fetchDepartments();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate department for coordinator/HOD/Faculty
    if (['Time Table Coordinator', 'Head of Dept', 'Faculty'].includes(formData.role) && !formData.department_id) {
      setError(`${formData.role} must be assigned to a department`);
      return;
    }

    setLoading(true);

    try {
      const signupData = {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        phone: formData.phone,
        role: formData.role
      };

      // Add department info
      if (formData.department_id) {
        signupData.department_id = formData.department_id;
      }

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

      alert("Account created successfully! Please sign in.");
      onFlip();

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-500 rounded-2xl opacity-75 blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative w-full h-full bg-gray-900 border border-white/10 rounded-2xl p-8 flex flex-col justify-center shadow-2xl backdrop-blur-xl overflow-y-auto max-h-[90vh]">
            
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">Create Account</h2>
                <p className="text-gray-400 text-sm">Join the future of academic scheduling</p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Full Name</label>
                        <div className="relative group/input">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <input 
                            type="text" 
                            name="name"
                            required
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                            placeholder="John Doe"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Phone</label>
                        <div className="relative group/input">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <input 
                            type="tel" 
                            name="phone"
                            required
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                            placeholder="+91 98765 43210"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative group/input">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                    <input 
                    type="email" 
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                    placeholder="name@example.com"
                    />
                </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Role</label>
                        <div className="relative group/input">
                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <select 
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner appearance-none cursor-pointer"
                            >
                                <option className="bg-gray-900" value="Time Table Coordinator">Coordinator</option>
                                <option className="bg-gray-900" value="Head of Dept">HOD</option>
                                <option className="bg-gray-900" value="Faculty">Faculty</option>
                                <option className="bg-gray-900" value="Student">Student</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Department</label>
                        <div className="relative group/input">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                            <select 
                                name="department_id"
                                value={formData.department_id}
                                onChange={handleChange}
                                required={['Time Table Coordinator', 'Head of Dept', 'Faculty'].includes(formData.role)}
                                className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner appearance-none cursor-pointer"
                            >
                                <option value="">Select Department</option>
                                {departments.map(dept => (
                                    <option key={dept.department_id} className="bg-gray-900" value={dept.department_id}>
                                        {dept.department_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Password</label>
                <div className="relative group/input">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                    <input 
                    type="password" 
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                    placeholder="Create a password"
                    />
                </div>
                </div>

                <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Confirm Password</label>
                <div className="relative group/input">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                    <input 
                    type="password" 
                    name="confirmPassword"
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                    placeholder="Confirm password"
                    />
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
                        Get Started <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
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
