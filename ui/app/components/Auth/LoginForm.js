'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabase';

export default function LoginForm({ onFlip }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
        // 1. Sign in
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password
        });

        if (authError) throw authError;

        // 2. Fetch User Profile for Role
        const userId = authData.user.id;
        
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('user_id', userId)
            .single();

        // 3. Redirect based on Role
        // Fallback to metadata or guess if profile missing (e.g. fresh signup)
        let role = profile?.role;
        if (!role && authData.user.user_metadata?.role) {
             const metaRole = authData.user.user_metadata.role;
             if (metaRole === 'Student') role = 'STUDENT';
             else if (metaRole === 'Head of Dept' || metaRole === 'Time Table Coordinator') role = 'COORDINATOR';
        }

        if (role === 'STUDENT') {
            router.push('/dashboard/student');
        } else if (role === 'FACULTY') {
            router.push('/dashboard/faculty');
        } else if (role === 'HOD' || role === 'COORDINATOR' || role === 'ADMIN') {
            router.push('/dashboard/coordinator');
        } else {
            // Default fallback
            console.warn("Unknown role, defaulting to student dashboard");
            router.push('/dashboard/student');
        }

    } catch (err) {
        console.error(err);
        setError(err.message === "Invalid login credentials" ? "Invalid email or password" : err.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="w-full h-full relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl opacity-75 blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative w-full h-full bg-gray-900 border border-white/10 rounded-2xl p-8 flex flex-col justify-center shadow-2xl backdrop-blur-xl">
            
            <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">Welcome Back</h2>
                <p className="text-gray-400 text-sm">Enter your credentials to access the portal</p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Email Address</label>
                <div className="relative group/input">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                    <input 
                    type="email" 
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                    placeholder="name@example.com"
                    />
                </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Password</label>
                        <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Forgot?</a>
                    </div>
                <div className="relative group/input">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within/input:text-indigo-400 transition-colors" />
                    <input 
                    type="password" 
                    name="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full bg-gray-950/50 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner"
                    placeholder="••••••••"
                    />
                </div>
                </div>

                <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full relative overflow-hidden bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group/btn mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover/btn:animate-shimmer" />
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <span className="relative z-10 flex items-center gap-2">
                        Sign In <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                    </span>
                )}
                </motion.button>
            </form>

            <div className="mt-8 text-center pt-6 border-t border-white/5">
                <p className="text-gray-500 text-sm">
                Don't have an account?{' '}
                <button 
                    onClick={onFlip}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors hover:underline underline-offset-4"
                >
                    Create one
                </button>
                </p>
            </div>
        </div>
    </div>
  );
}
