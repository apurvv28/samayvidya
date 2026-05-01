// app/components/Dashboard/DashboardNavbar.js
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut, LayoutDashboard, Calendar, Users, PlusCircle, Building2, BookOpen, BrainCircuit, BarChart3, FileText, FilePlus, Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from './NotificationBell';

export default function DashboardNavbar({ role, activeTab, setActiveTab, showNavItems = true, showLogout = true }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { signOut, profile } = useAuth();
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
          { id: 'add-faculty', label: 'Faculty', icon: Users },
          { id: 'manage-load', label: 'Load', icon: LayoutDashboard },
          { id: 'add-division', label: 'Divisions', icon: PlusCircle },
          { id: 'resources', label: 'Resources', icon: Building2 },
        ];
      case 'hod':
        return [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
          { id: 'timetable', label: 'Timetables', icon: Calendar },
          { id: 'leaves', label: 'Leaves', icon: FileText },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        ];
      case 'faculty':
        return [
          { id: 'timetable', label: 'Timetable', icon: Calendar },
          { id: 'apply-leave', label: 'Apply Leave', icon: FilePlus },
          { id: 'my-leaves', label: 'My Leaves', icon: FileText },
        ];
      case 'student':
        return [
          { id: 'timetable', label: 'Timetable', icon: Calendar },
          { id: 'notifications', label: 'Notifications', icon: Bell },
        ];
      default:
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 z-50 w-full border-b border-gray-200 bg-white/90 backdrop-blur-md shadow-sm"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex flex-col">
              <span className="text-xl font-bold text-gray-900">
                समयविद्या
              </span>
              <span className="text-xs text-gray-500 font-medium">Academic Timetable Framework</span>
            </Link>
            <span className="px-2 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-700 font-semibold capitalize">
              {role}
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:block">
            <div className="flex items-center space-x-1">
              {showNavItems && navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab && setActiveTab(item.id)}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === item.id 
                      ? 'bg-gray-900 text-white shadow-sm' 
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden xl:inline">{item.label}</span>
                </button>
              ))}
              
              {showNavItems && <div className="h-6 w-px bg-gray-200 mx-2" />}
              
              {/* Notification Bell */}
              <div className="px-2">
                <NotificationBell userEmail={profile?.email} />
              </div>
              
              {showLogout && (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden xl:inline">Logout</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile actions */}
          <div className="lg:hidden flex items-center gap-2">
            <NotificationBell userEmail={profile?.email} />
            {(showNavItems || showLogout) && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isMobileMenuOpen && (showNavItems || showLogout) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:hidden overflow-hidden bg-white border-t border-gray-200"
          >
            <div className="space-y-1 px-4 py-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
              {showNavItems && navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab && setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all ${
                    activeTab === item.id 
                      ? 'bg-gray-900 text-white' 
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
              
              <div className="border-t border-gray-200 my-2 pt-2">
                {showLogout && (
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-red-600 hover:bg-red-50 transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
