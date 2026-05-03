'use client';

import { useEffect, useState } from 'react';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import DashboardLayout, { DashboardCard, LoadingState } from '../../components/Dashboard/DashboardLayout';
import Semester from '../../components/Dashboard/Semester';
import AddDivision from '../../components/Dashboard/AddDivision';
import ManageResources from '../../components/Dashboard/ManageResources';
import AgentOrchestrator from '../../components/Dashboard/AgentOrchestrator';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import ManageFaculty from '../../components/Dashboard/ManageFaculty';
import ManageFacultyGrid from '../../components/Dashboard/ManageFacultyGrid';
import FacultyList from '../../components/Dashboard/FacultyList';
import UserProvisioning from '../../components/Dashboard/UserProvisioning';
import RoleGuard from '../../components/RoleGuard';
import CoordinatorProfile from '../../components/Dashboard/CoordinatorProfile';
import { BookOpen, BrainCircuit, Calendar, Users, LayoutDashboard, PlusCircle, Building2, LogOut, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') || '' : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function CoordinatorDashboard() {
  const [activeTab, setActiveTab] = useState('semester');
  const [latestVersionId, setLatestVersionId] = useState(null);
  const router = useRouter();
  const { signOut } = useAuth();

  const navItems = [
    { id: 'semester', label: 'Semester', icon: BookOpen },
    { id: 'agent', label: 'Agent', icon: BrainCircuit },
    { id: 'timetable', label: 'Timetables', icon: Calendar },
    { id: 'add-faculty', label: 'Faculty', icon: Users },
    { id: 'manage-load', label: 'Load', icon: LayoutDashboard },
    { id: 'add-division', label: 'Divisions', icon: PlusCircle },
    { id: 'resources', label: 'Resources', icon: Building2 },
    { id: 'profile', label: 'Profile', icon: UserCircle },
  ];

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  useEffect(() => {
    if (activeTab !== 'timetable' || latestVersionId) {
      return;
    }

    const fetchLatestVersion = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/timetable-versions`, {
          headers: authHeaders(),
        });
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const versionRows = payload.data || [];
        const latestVersion = versionRows[0];
        if (latestVersion?.version_id) {
          setLatestVersionId(latestVersion.version_id);
        }
      } catch (error) {
        console.error('Failed to load latest timetable version:', error);
      }
    };

    fetchLatestVersion();
  }, [activeTab, latestVersionId]);

  useEffect(() => {
    if (activeTab !== 'timetable') {
      return;
    }

    let cancelled = false;

    const refreshLatestVersion = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/timetable-versions`, {
          headers: authHeaders(),
        });
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const versionRows = payload.data || [];
        const latestVersion = versionRows[0];
        if (!cancelled && latestVersion?.version_id && latestVersion.version_id !== latestVersionId) {
          setLatestVersionId(latestVersion.version_id);
        }
      } catch (error) {
        console.error('Failed to refresh latest timetable version:', error);
      }
    };

    refreshLatestVersion();

    return () => {
      cancelled = true;
    };
  }, [activeTab, latestVersionId]);

  const getTabIcon = () => {
    switch (activeTab) {
      case 'semester':
        return <BookOpen className="w-6 h-6 text-teal-600" />;
      case 'agent':
        return <BrainCircuit className="w-6 h-6 text-teal-600" />;
      case 'timetable':
        return <Calendar className="w-6 h-6 text-teal-600" />;
      case 'add-faculty':
        return <Users className="w-6 h-6 text-teal-600" />;
      case 'manage-load':
        return <LayoutDashboard className="w-6 h-6 text-teal-600" />;
      case 'add-division':
        return <PlusCircle className="w-6 h-6 text-teal-600" />;
      case 'resources':
        return <Building2 className="w-6 h-6 text-teal-600" />;
      case 'profile':
        return <UserCircle className="w-6 h-6 text-teal-600" />;
      default:
        return null;
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'semester':
        return 'Semester Management';
      case 'agent':
        return 'Agent Orchestrator';
      case 'timetable':
        return 'Timetable Viewer';
      case 'add-faculty':
        return 'Manage Faculty';
      case 'manage-load':
        return 'Manage Faculty Load';
      case 'add-division':
        return 'Manage Divisions';
      case 'resources':
        return 'Manage Resources';
      case 'profile':
        return 'Profile';
      default:
        return 'Dashboard';
    }
  };

  const getTabSubtitle = () => {
    switch (activeTab) {
      case 'semester':
        return 'Configure semester details and academic calendar';
      case 'agent':
        return 'Generate and manage timetables using AI agents';
      case 'timetable':
        return 'View and manage generated timetables';
      case 'add-faculty':
        return 'Add and manage faculty members';
      case 'manage-load':
        return 'Assign subjects and manage faculty workload';
      case 'add-division':
        return 'Create and manage student divisions';
      case 'resources':
        return 'Manage classrooms, labs, and other resources';
      case 'profile':
        return 'Your account, password, and department transfer';
      default:
        return '';
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'semester':
        return (
          <>
            {/* Custom header for Semester with inline controls on the right */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Semester Management
                  </h1>
                  <p className="text-base text-gray-600 mt-1">Configure semester details and academic calendar</p>
                </div>
              </div>
            </div>
            <Semester />
          </>
        );
      case 'add-faculty':
        return (
          <>
            {/* Custom header for Manage Faculty with inline controls on the right */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Manage Faculty
                  </h1>
                  <p className="text-base text-gray-600 mt-1">Add and manage faculty members</p>
                </div>
              </div>
            </div>
            <ManageFacultyGrid />
          </>
        );
      case 'add-hod':
        return <UserProvisioning mode="hod" />;
      case 'manage-load':
        return (
          <>
            {/* Custom header for Manage Load with inline controls on the right */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Manage Faculty Load
                  </h1>
                  <p className="text-base text-gray-600 mt-1">Assign subjects and manage faculty workload</p>
                </div>
              </div>
            </div>
            <ManageFaculty />
          </>
        );
      case 'add-division':
        return (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Manage Divisions
                  </h1>
                  <p className="text-base text-gray-600 mt-1">Create and manage student divisions</p>
                </div>
              </div>
            </div>
            <AddDivision />
          </>
        );
      case 'resources':
        return (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Manage Resources
                  </h1>
                  <p className="text-base text-gray-600 mt-1">Add and manage classrooms and lab facilities</p>
                </div>
              </div>
            </div>
            <ManageResources />
          </>
        );
      case 'agent':
        return (
          <>
            {/* Custom header for Agent Orchestrator with inline controls on the right */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <BrainCircuit className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Agent Orchestrator
                  </h1>
                  <p className="text-base text-gray-600 mt-1">Generate and manage timetables using AI agents</p>
                </div>
              </div>
            </div>
            <AgentOrchestrator
              onTimetableCreated={(versionId) => setLatestVersionId(versionId)}
              onViewTimetable={() => setActiveTab('timetable')}
            />
          </>
        );
      case 'timetable':
        return (
          <>
            {/* Custom header for Timetable Viewer with inline controls on the right */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    Timetable Viewer
                  </h1>
                  <p className="text-base text-gray-600 mt-1">View and manage generated timetables</p>
                </div>
              </div>
            </div>
            <TimetableViewer
              versionId={latestVersionId}
              onVersionChange={(newVersionId) => setLatestVersionId(newVersionId)}
              canManageTimetable
            />
          </>
        );
      case 'profile':
        return <CoordinatorProfile />;
      default:
        return null;
    }
  };

  return (
    <RoleGuard allowedRole={['COORDINATOR', 'ADMIN']}>
      <div className="min-h-screen bg-white">
        <DashboardNavbar
          role="coordinator"
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showNavItems={false}
          showLogout={false}
        />
        
        <DashboardLayout
          title={['semester', 'agent', 'timetable', 'add-faculty', 'manage-load', 'add-division', 'resources', 'profile'].includes(activeTab) ? null : getTabTitle()}
          subtitle={['semester', 'agent', 'timetable', 'add-faculty', 'manage-load', 'add-division', 'resources', 'profile'].includes(activeTab) ? null : getTabSubtitle()}
          icon={['semester', 'agent', 'timetable', 'add-faculty', 'manage-load', 'add-division', 'resources', 'profile'].includes(activeTab) ? null : getTabIcon()}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
            <aside className="h-fit lg:sticky lg:top-24 bg-white border border-gray-200 rounded-xl p-3">
              <div className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={activeTab === item.id ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      activeTab === item.id
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-3 pt-3">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </aside>

            <DashboardCard className="min-h-[60vh]">
              {renderContent()}
            </DashboardCard>
          </div>
        </DashboardLayout>
      </div>
    </RoleGuard>
  );
}
