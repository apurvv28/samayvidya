'use client';

import { useState } from 'react';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import Semester from '../../components/Dashboard/Semester';
import ManageFaculty from '../../components/Dashboard/ManageFaculty';
import AddDivision from '../../components/Dashboard/AddDivision';
import ManageResources from '../../components/Dashboard/ManageResources';
import AgentOrchestrator from '../../components/Dashboard/AgentOrchestrator';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';

export default function CoordinatorDashboard() {
  const [activeTab, setActiveTab] = useState('semester');
  const [latestVersionId, setLatestVersionId] = useState(null);

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
          <AgentOrchestrator
            onTimetableCreated={(versionId) => setLatestVersionId(versionId)}
            onViewTimetable={() => setActiveTab('timetable')}
          />
        );
      case 'timetable':
        return <TimetableViewer versionId={latestVersionId} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
      <DashboardNavbar role="coordinator" activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-gray-900/50 border border-white/5 rounded-2xl min-h-150 backdrop-blur-sm">
            {renderContent()}
        </div>
      </main>
    </div>
  );
}
