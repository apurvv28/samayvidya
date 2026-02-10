'use client';

import { useState } from 'react';
import { BackgroundBeams } from '../../components/ui/BackgroundBeams';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import { AlertTriangle } from 'lucide-react';

export default function FacultyDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
      <DashboardNavbar role="faculty" activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <BackgroundBeams className="opacity-20" />
        
        <div className="relative z-10 w-full max-w-2xl text-center space-y-8">
            <div className="mx-auto w-24 h-24 bg-purple-500/10 rounded-full flex items-center justify-center border border-purple-500/20 shadow-lg shadow-purple-500/20">
                <AlertTriangle className="w-12 h-12 text-purple-400" />
            </div>
            
            <div className="space-y-4">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                    Faculty Portal Under Maintenance
                </h1>
                <p className="text-lg text-gray-400 max-w-lg mx-auto">
                    We are currently upgrading the faculty dashboard with advanced scheduling tools. 
                    Please check back soon for the new experience.
                </p>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                Upgrading System
            </div>
        </div>
      </main>
    </div>
  );
}
