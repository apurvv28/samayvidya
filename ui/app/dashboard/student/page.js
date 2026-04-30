'use client';

import { useState, useEffect } from 'react';
import { BackgroundBeams } from '../../components/ui/BackgroundBeams';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import RoleGuard from '../../components/RoleGuard';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Loader2, CheckCircle2, Building2, Users, Bell, Clock, BookOpen } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('timetable');
  const [latestVersionId, setLatestVersionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState(null);
  
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
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'warning':
        return <Bell className="w-5 h-5 text-amber-400" />;
      default:
        return <Bell className="w-5 h-5 text-blue-400" />;
    }
  };

  const getNotificationBgColor = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-900/20 border-green-500/20';
      case 'warning':
        return 'bg-amber-900/20 border-amber-500/20';
      default:
        return 'bg-blue-900/20 border-blue-500/20';
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
      <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
        <DashboardNavbar role="student" activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 min-h-screen overflow-hidden">
          <BackgroundBeams className="opacity-20" />
          
          <div className="relative z-10 w-full max-w-7xl mx-auto">
            {/* Loading State */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Loading your dashboard...</p>
                </div>
              </div>
            ) : studentInfo ? (
              <>
                {/* Student Info Banner */}
                <div className="mb-6 bg-gradient-to-r from-indigo-900/30 to-purple-900/20 border border-indigo-500/20 rounded-xl px-6 py-4 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                      <GraduationCap className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <h2 className="text-lg font-bold text-white">
                          {studentInfo.division_name}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
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

                {/* Timetable Viewer */}
                {activeTab === 'timetable' && (
                  <div className="bg-gray-900/50 border border-white/5 rounded-2xl min-h-[60vh] backdrop-blur-sm">
                    <TimetableViewer
                      versionId={latestVersionId}
                      onVersionChange={(newId) => setLatestVersionId(newId)}
                      forcedDivisionId={studentInfo.division_id}
                    />
                  </div>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                  <div className="bg-gray-900/50 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                          <Bell className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white">Notifications</h2>
                          <p className="text-sm text-gray-400">
                            {notifications.filter(n => !n.read).length} unread notifications
                          </p>
                        </div>
                      </div>
                      {notifications.some(n => !n.read) && (
                        <button
                          onClick={markAllAsRead}
                          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {notifications.length === 0 ? (
                        <div className="text-center py-12">
                          <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-gray-400 mb-2">No Notifications</h3>
                          <p className="text-gray-500">You're all caught up!</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`p-4 rounded-xl border transition-all ${
                              notif.read
                                ? 'bg-gray-900/30 border-gray-800'
                                : `${getNotificationBgColor(notif.type)} hover:shadow-lg`
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <div className="shrink-0 mt-1">
                                {getNotificationIcon(notif.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h3 className={`font-semibold ${notif.read ? 'text-gray-400' : 'text-white'}`}>
                                    {notif.title}
                                  </h3>
                                  {!notif.read && (
                                    <span className="shrink-0 w-2 h-2 bg-indigo-500 rounded-full mt-2"></span>
                                  )}
                                </div>
                                <p className={`text-sm mb-2 ${notif.read ? 'text-gray-500' : 'text-gray-300'}`}>
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
                                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
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
              /* No Student Info Found */
              <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-12 text-center backdrop-blur-sm">
                <GraduationCap className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">
                  Student Information Not Found
                </h3>
                <p className="text-gray-500">
                  Unable to load your division and department information. Please contact your coordinator.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
