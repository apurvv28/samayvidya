'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import DashboardLayout, { DashboardCard } from '../../components/Dashboard/DashboardLayout';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import RoleGuard from '../../components/RoleGuard';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Loader2, CheckCircle2, Building2, Users, Bell, Clock, BookOpen, Calendar, LogOut } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function StudentDashboard() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('timetable');
  const [latestVersionId, setLatestVersionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState(null);

  const navItems = [
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };
  
  // Mock notifications
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: 'Timetable Updated',
      message: 'Your division timetable has been updated for this semester.',
      type: 'info',
      date: '2026-04-28',
      read: false,
    },
    {
      id: 2,
      title: 'Faculty Leave Notification',
      message: 'Dr. CDK will be on leave on May 5th. Class will be rescheduled.',
      type: 'warning',
      date: '2026-04-27',
      read: false,
    },
    {
      id: 3,
      title: 'Exam Schedule Released',
      message: 'Mid-semester exam schedule has been published. Check your timetable.',
      type: 'success',
      date: '2026-04-25',
      read: true,
    },
  ]);

  const markAsRead = (notificationId) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'warning':
        return <Bell className="w-5 h-5 text-amber-600" />;
      default:
        return <Bell className="w-5 h-5 text-teal-600" />;
    }
  };

  const getNotificationBgColor = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-teal-50 border-teal-200';
    }
  };

  // Fetch student info from JWT token (division_id is already in profile)
  useEffect(() => {
    const fetchStudentInfo = async () => {
      if (!profile?.email) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const token = localStorage.getItem('authToken') || '';
        
        // Decode JWT to get division_id and other student info
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        
        // Get division details
        if (decoded.division_id) {
          const divResponse = await fetch(`${API_BASE_URL}/divisions`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (divResponse.ok) {
            const divData = await divResponse.json();
            const division = divData.data?.find(d => d.division_id === decoded.division_id);
            
            if (division) {
              // Get department details
              const deptResponse = await fetch(`${API_BASE_URL}/auth/departments`);
              if (deptResponse.ok) {
                const deptData = await deptResponse.json();
                const department = deptData.data?.find(d => d.department_id === division.department_id);
                
                setStudentInfo({
                  division_id: decoded.division_id,
                  division_name: division.division_name,
                  department_id: division.department_id,
                  department_name: department?.department_name || 'Unknown Department',
                  year: division.year,
                  prn: decoded.prn,
                  email: decoded.email,
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch student info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentInfo();
  }, [profile]);

  // Fetch latest timetable version
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/timetable-versions`);
        if (response.ok) {
          const payload = await response.json();
          const versions = payload.data || [];
          if (versions.length > 0) {
            setLatestVersionId(versions[0].version_id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch timetable version:', err);
      }
    };
    fetchVersion();
  }, []);

  return (
    <RoleGuard allowedRole="STUDENT">
      <div className="min-h-screen bg-white">
        <DashboardNavbar
          role="student"
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showNavItems={false}
          showLogout={false}
        />

        <DashboardLayout>
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
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading your dashboard...</p>
                  </div>
                </div>
              ) : studentInfo ? (
                <>
                  <div className="mb-6 bg-gradient-to-r from-teal-50 to-indigo-50 border-2 border-teal-200 rounded-xl px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center border-2 border-teal-200">
                        <GraduationCap className="w-6 h-6 text-teal-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <h2 className="text-lg font-bold text-gray-900">{studentInfo.division_name}</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5" />
                            {studentInfo.department_name}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            {studentInfo.year}
                          </div>
                          {studentInfo.prn && (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              PRN: {studentInfo.prn}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {activeTab === 'timetable' && (
                    <div className="bg-white border-2 border-gray-100 rounded-2xl min-h-[60vh]">
                      <TimetableViewer
                        versionId={latestVersionId}
                        onVersionChange={(newId) => setLatestVersionId(newId)}
                        forcedDivisionId={studentInfo.division_id}
                      />
                    </div>
                  )}

                  {activeTab === 'notifications' && (
                    <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center border-2 border-teal-200">
                            <Bell className="w-5 h-5 text-teal-600" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Notifications</h2>
                            <p className="text-sm text-gray-600">
                              {notifications.filter((n) => !n.read).length} unread notifications
                            </p>
                          </div>
                        </div>
                        {notifications.some((n) => !n.read) && (
                          <button
                            onClick={markAllAsRead}
                            className="text-sm text-teal-600 hover:text-teal-700 transition-colors font-medium"
                          >
                            Mark all as read
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {notifications.length === 0 ? (
                          <div className="text-center py-12">
                            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600 mb-2">No Notifications</h3>
                            <p className="text-gray-500">You&apos;re all caught up!</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`p-4 rounded-xl border-2 transition-all ${
                                notif.read ? 'bg-gray-50 border-gray-100' : `${getNotificationBgColor(notif.type)} hover:shadow-md`
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                <div className="shrink-0 mt-1">{getNotificationIcon(notif.type)}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <h3 className={`font-semibold ${notif.read ? 'text-gray-600' : 'text-gray-900'}`}>
                                      {notif.title}
                                    </h3>
                                    {!notif.read && <span className="shrink-0 w-2 h-2 bg-teal-600 rounded-full mt-2"></span>}
                                  </div>
                                  <p className={`text-sm mb-2 ${notif.read ? 'text-gray-500' : 'text-gray-700'}`}>
                                    {notif.message}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                      <Clock className="w-3.5 h-3.5" />
                                      {notif.date}
                                    </div>
                                    {!notif.read && (
                                      <button
                                        onClick={() => markAsRead(notif.id)}
                                        className="text-xs text-teal-600 hover:text-teal-700 transition-colors font-medium"
                                      >
                                        Mark as read
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white border-2 border-gray-100 rounded-2xl p-12 text-center">
                  <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">Student Information Not Found</h3>
                  <p className="text-gray-500">
                    Unable to load your division and department information. Please contact your coordinator.
                  </p>
                </div>
              )}
            </DashboardCard>
          </div>
        </DashboardLayout>
      </div>
    </RoleGuard>
  );
}
