'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, LayoutDashboard, Calendar, Users, PlusCircle, Building2, BookOpen, BrainCircuit, BarChart3, FileText, FilePlus, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

export default function DashboardNavbar({ role, activeTab, setActiveTab }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  // Define navigation items based on role
  const getNavItems = () => {
    switch (role) {
      case 'coordinator':
        return [
          { id: 'semester', label: 'Semester', icon: BookOpen },
          { id: 'agent', label: 'Agent', icon: BrainCircuit },
          { id: 'timetable', label: 'Timetables', icon: Calendar },
          { id: 'add-faculty', label: 'Manage Faculty', icon: Users },
          { id: 'manage-load', label: 'Manage Load', icon: LayoutDashboard },
          { id: 'add-division', label: 'Manage Divisions', icon: PlusCircle },
          { id: 'resources', label: 'Manage Resources', icon: Building2 },
        ];
      case 'hod':
        return [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
          { id: 'timetable', label: 'Timetables', icon: Calendar },
          { id: 'leaves', label: 'Leaves', icon: FileText },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'profile', label: 'Profile', icon: UserCircle },
        ];
      case 'faculty':
        return [
          { id: 'timetable', label: 'My Timetable', icon: Calendar },
          { id: 'apply-leave', label: 'Apply Leave', icon: FilePlus },
          { id: 'my-leaves', label: 'My Leaves', icon: FileText },
          { id: 'profile', label: 'Profile', icon: UserCircle },
        ];
      case 'student':
        return [
          { id: 'timetable', label: 'Timetable', icon: Calendar },
          { id: 'notifications', label: 'Notifications', icon: FileText },
        ];
      default:
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-gray-800 bg-gray-900/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex flex-col">
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                समयविद्या
              </span>
            </Link>
            <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400 capitalize">
              {role}
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab && setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === item.id 
                      ? 'bg-indigo-600/10 text-indigo-400' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
              
              <div className="h-6 w-px bg-gray-800 mx-2" />
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-800 hover:text-white focus:outline-none"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden overflow-hidden bg-gray-900 border-b border-gray-800"
          >
            <div className="space-y-1 px-4 py-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab && setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    activeTab === item.id 
                      ? 'bg-indigo-600/10 text-indigo-400' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
              
              <div className="border-t border-gray-800 my-2 pt-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-3 rounded-md text-base font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
