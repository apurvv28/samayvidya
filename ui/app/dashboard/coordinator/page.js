'use client';

import { useState } from 'react';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import Semester from '../../components/Dashboard/Semester';
import ManageFaculty from '../../components/Dashboard/ManageFaculty';
import AddDivision from '../../components/Dashboard/AddDivision';
import ManageResources from '../../components/Dashboard/ManageResources';

export default function CoordinatorDashboard() {
  const [activeTab, setActiveTab] = useState('semester');

  const renderContent = () => {
    switch (activeTab) {
      case 'semester':
        return <Semester />;
      case 'add-faculty':
        return <ManageFaculty />;
      case 'add-division':
        return <AddDivision />;
      case 'resources':
        return <ManageResources />;
      case 'agent':
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
                <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center border border-purple-500/20">
                    <span className="text-2xl">🤖</span>
                </div>
                <h2 className="text-xl font-semibold text-white">AI Agent</h2>
                <p className="text-gray-400">Automated scheduling optimization running in background...</p>
            </div>
        );
      case 'timetable':
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                    <span className="text-2xl">📅</span>
                </div>
                <h2 className="text-xl font-semibold text-white">My Timetable</h2>
                <p className="text-gray-400">Personal schedule view is being generated.</p>
            </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
      <DashboardNavbar role="coordinator" activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-gray-900/50 border border-white/5 rounded-2xl min-h-[600px] backdrop-blur-sm">
            {renderContent()}
        </div>
      </main>
    </div>
  );
}
