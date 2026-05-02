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
const DAY_TABLE_MARKER = '__DAY_TABLE__:';

export default function StudentDashboard() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('timetable');
  const [latestVersionId, setLatestVersionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState(null);

  const navItems = [
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'updates', label: 'Updates', icon: Bell },
  ];

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };
  
  const [updates, setUpdates] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);

  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('authToken') || '';
      await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setUpdates((prev) => prev.filter((item) => item.notification_id !== notificationId));
    } catch (error) {
      console.error('Failed to mark update as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('authToken') || '';
      await fetch(`${API_BASE_URL}/notifications/mark-all-read?recipient_email=${encodeURIComponent(profile?.email || '')}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setUpdates([]);
    } catch (error) {
      console.error('Failed to mark all updates as read:', error);
    }
  };

  const getNotificationIcon = (type) => {
    if (type === 'REVISED_DAY_TIMETABLE') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (type && type.includes('LEAVE')) return <Bell className="w-5 h-5 text-amber-600" />;
    return <Bell className="w-5 h-5 text-teal-600" />;
  };

  const getNotificationBgColor = (type) => {
    if (type === 'REVISED_DAY_TIMETABLE') return 'bg-green-50 border-green-200';
    if (type && type.includes('LEAVE')) return 'bg-amber-50 border-amber-200';
    return 'bg-teal-50 border-teal-200';
  };

  const parseDayTablePayload = (rawBody) => {
    const body = String(rawBody || '');
    if (!body.startsWith(DAY_TABLE_MARKER)) return null;
    try {
      const parsed = JSON.parse(body.slice(DAY_TABLE_MARKER.length));
      if (!parsed || !Array.isArray(parsed.rows)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    const fetchUpdates = async () => {
      if (!profile?.email) return;
      try {
        setLoadingUpdates(true);
        const token = localStorage.getItem('authToken') || '';
        const res = await fetch(
          `${API_BASE_URL}/notifications?recipient_email=${encodeURIComponent(profile.email)}&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setUpdates(data.data || []);
      } catch (error) {
        console.error('Failed to fetch updates:', error);
      } finally {
        setLoadingUpdates(false);
      }
    };
    fetchUpdates();
  }, [profile?.email]);

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

                  {activeTab === 'updates' && (
                    <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center border-2 border-teal-200">
                            <Bell className="w-5 h-5 text-teal-600" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Updates</h2>
                            <p className="text-sm text-gray-600">
                              {updates.length} unread updates
                            </p>
                          </div>
                        </div>
                        {updates.length > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-sm text-teal-600 hover:text-teal-700 transition-colors font-medium"
                          >
                            Mark all as read
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {loadingUpdates ? (
                          <div className="text-center py-12">
                            <Loader2 className="w-10 h-10 text-gray-300 animate-spin mx-auto mb-4" />
                            <p className="text-gray-500">Loading updates...</p>
                          </div>
                        ) : updates.length === 0 ? (
                          <div className="text-center py-12">
                            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600 mb-2">No Updates</h3>
                            <p className="text-gray-500">You&apos;re all caught up!</p>
                          </div>
                        ) : (
                          updates.map((notif) => (
                            <div
                              key={notif.notification_id}
                              className={`p-4 rounded-xl border-2 transition-all ${getNotificationBgColor(notif.notification_type)} hover:shadow-md`}
                            >
                              {(() => {
                                const tablePayload = parseDayTablePayload(notif.body);
                                return (
                              <div className="flex items-start gap-4">
                                <div className="shrink-0 mt-1">{getNotificationIcon(notif.notification_type)}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <h3 className="font-semibold text-gray-900">
                                      {notif.subject}
                                    </h3>
                                    <span className="shrink-0 w-2 h-2 bg-teal-600 rounded-full mt-2"></span>
                                  </div>
                                  {tablePayload ? (
                                    <div className="mb-2">
                                      <p className="text-sm font-medium text-gray-800 mb-2">
                                        {tablePayload.division_name} - {tablePayload.day_name}
                                      </p>
                                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                        <table className="min-w-full text-xs">
                                          <thead className="bg-gray-100">
                                            <tr>
                                              <th className="text-left px-3 py-2 font-semibold text-gray-700">Time</th>
                                              <th className="text-left px-3 py-2 font-semibold text-gray-700">Subject</th>
                                              <th className="text-left px-3 py-2 font-semibold text-gray-700">Faculty/Slot</th>
                                              <th className="text-left px-3 py-2 font-semibold text-gray-700">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {tablePayload.rows.map((row, idx) => (
                                              <tr key={`${notif.notification_id}-${idx}`} className="border-t border-gray-100">
                                                <td className="px-3 py-2 text-gray-700">{row.time || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{row.subject || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{row.faculty || '-'}</td>
                                                <td className="px-3 py-2 text-gray-700">{row.status || '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm mb-2 text-gray-700">
                                      {notif.body}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                      <Clock className="w-3.5 h-3.5" />
                                      {new Date(notif.sent_at || notif.created_at || Date.now()).toLocaleString('en-IN')}
                                    </div>
                                    <button
                                      onClick={() => markAsRead(notif.notification_id)}
                                      className="text-xs text-teal-600 hover:text-teal-700 transition-colors font-medium"
                                    >
                                      Mark as read
                                    </button>
                                  </div>
                                </div>
                              </div>
                                );
                              })()}
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
