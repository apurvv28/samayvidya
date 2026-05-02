'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import DashboardLayout, { DashboardCard } from '../../components/Dashboard/DashboardLayout';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import FacultyProfile from '../../components/Dashboard/FacultyProfile';
import RoleGuard from '../../components/RoleGuard';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2, Calendar, Users, BarChart3, AlertCircle,
  FileText, Loader2, XCircle, Clock, Trash2, Check, X, LayoutDashboard, LogOut, UserCircle, ExternalLink
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function HODDashboard() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [userInfo, setUserInfo] = useState(null);
  const [timetableVersions, setTimetableVersions] = useState([]);
  const [latestVersionId, setLatestVersionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    approvedTimetables: 0,
    pendingApprovals: 0,
    facultyCount: 0,
    divisionsCount: 0,
  });

  // Analytics state
  const [analytics, setAnalytics] = useState({
    facultyWorkload: [],
    roomUtilization: [],
    leaveStats: null,
    conflicts: [],
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Leave management state
  const [allLeaves, setAllLeaves] = useState([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [leavesError, setLeavesError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // leave_id being acted on

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'timetable', label: 'Timetables', icon: Calendar },
    { id: 'leaves', label: 'Leaves', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'profile', label: 'Profile', icon: UserCircle },
  ];

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  // Fetch user info and timetable data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get user profile
        const authResponse = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
          },
        }).catch(() => null);

        if (authResponse?.ok) {
          const authData = await authResponse.json();
          setUserInfo(authData.data);
        }

        // Get timetable versions
        const versionsResponse = await fetch(`${API_BASE_URL}/timetable-versions`);
        if (versionsResponse.ok) {
          const versionsData = await versionsResponse.json();
          const versions = versionsData.data || [];
          setTimetableVersions(versions);
          
          if (versions.length > 0) {
            setLatestVersionId(versions[0].version_id);
          }
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to load dashboard data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch leaves when tab switches to 'leaves'
  useEffect(() => {
    if (activeTab === 'leaves') {
      fetchAllLeaves();
    } else if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab]);

  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const token = localStorage.getItem('authToken') || '';
      
      // Fetch all analytics data in parallel
      const [workloadRes, roomRes, leaveStatsRes, conflictsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/analytics/faculty-workload`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/analytics/room-utilization`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/analytics/leave-statistics`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/analytics/timetable-conflicts`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const [workloadData, roomData, leaveStatsData, conflictsData] = await Promise.all([
        workloadRes.ok ? workloadRes.json() : { data: { workload: [] } },
        roomRes.ok ? roomRes.json() : { data: { utilization: [] } },
        leaveStatsRes.ok ? leaveStatsRes.json() : { data: null },
        conflictsRes.ok ? conflictsRes.json() : { data: { conflicts: [] } },
      ]);

      setAnalytics({
        facultyWorkload: workloadData.data?.workload || [],
        roomUtilization: roomData.data?.utilization || [],
        leaveStats: leaveStatsData.data || null,
        conflicts: conflictsData.data?.conflicts || [],
      });
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchAllLeaves = async () => {
    try {
      setLoadingLeaves(true);
      setLeavesError(null);
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(`${API_BASE_URL}/faculty-leaves`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch leaves');
      }
      const data = await res.json();
      setAllLeaves(data.data || []);
    } catch (err) {
      setLeavesError(err.message);
    } finally {
      setLoadingLeaves(false);
    }
  };

  const handleLeaveAction = async (leaveId, action) => {
    try {
      setActionLoading(leaveId);
      const token = localStorage.getItem('authToken') || '';

      if (action === 'DELETE') {
        const res = await fetch(`${API_BASE_URL}/faculty-leaves/${leaveId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to delete leave');
        }
        setAllLeaves(prev => prev.filter(l => l.leave_id !== leaveId));
      } else {
        const res = await fetch(`${API_BASE_URL}/faculty-leaves/${leaveId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ status: action }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed to ${action.toLowerCase()} leave`);
        }
        setAllLeaves(prev =>
          prev.map(l => l.leave_id === leaveId ? { ...l, status: action } : l)
        );
      }
    } catch (err) {
      setLeavesError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold border-2 border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold border-2 border-red-200">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-xs font-semibold border-2 border-yellow-200">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  };

  const pendingLeaves = allLeaves.filter(l => l.status === 'PENDING');
  const processedLeaves = allLeaves.filter(l => l.status !== 'PENDING');

  const isPdfProof = (url) => String(url || '').toLowerCase().includes('.pdf');
  const isImageProof = (url) => {
    const value = String(url || '').toLowerCase();
    return value.includes('.png') || value.includes('.jpg') || value.includes('.jpeg') || value.includes('.webp') || value.includes('.gif');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-8 w-full max-w-6xl">
            {/* Header */}
            <div className="space-y-2">
              <h1 className="text-4xl font-normal text-gray-900" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                Head of Department Dashboard
              </h1>
              <p className="text-gray-600">
                Monitor timetables and manage faculty leave requests for your department
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-teal-50 border-2 border-teal-100 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-600">Approved Timetables</h3>
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.approvedTimetables}</p>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-100 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-600">Pending Leaves</h3>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{pendingLeaves.length}</p>
              </div>

              <div className="bg-purple-50 border-2 border-purple-100 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-600">Faculty Members</h3>
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats.facultyCount}</p>
              </div>

              <div className="bg-green-50 border-2 border-green-100 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-600">Timetable Versions</h3>
                  <Calendar className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{timetableVersions.length}</p>
              </div>
            </div>

            {/* Recent Timetables */}
            <div className="bg-white border-2 border-gray-100 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600" />
                Recent Timetables
              </h2>
              
              {timetableVersions.length === 0 ? (
                <p className="text-gray-600">No timetables yet</p>
              ) : (
                <div className="space-y-3">
                  {timetableVersions.slice(0, 5).map(version => (
                    <div key={version.version_id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">Version {version.version_number || 'N/A'}</p>
                        <p className="text-sm text-gray-600">
                          Created {new Date(version.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-sm font-medium border border-teal-200">
                        {version.status || 'draft'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white border-2 border-gray-100 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('leaves')}
                  className="p-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  Review Leave Requests ({pendingLeaves.length} pending)
                </button>
                <button
                  onClick={() => setActiveTab('timetable')}
                  className="p-4 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <Calendar className="w-5 h-5" />
                  View Timetables
                </button>
              </div>
            </div>
          </div>
        );

      case 'timetable':
        return (
          <div className="w-full max-w-6xl">
            <TimetableViewer
              versionId={latestVersionId}
              onVersionChange={(newVersionId) => setLatestVersionId(newVersionId)}
              canManageTimetable
            />
          </div>
        );

      case 'leaves':
        return (
          <div className="w-full max-w-6xl space-y-6">
            {/* Leave Management Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-200">
                  <FileText className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Faculty Leave Management</h2>
                  <p className="text-gray-600 text-sm">Review, approve, or reject faculty leave requests</p>
                </div>
              </div>
              <button
                onClick={fetchAllLeaves}
                disabled={loadingLeaves}
                className="px-4 py-2 text-sm font-semibold text-teal-700 border-2 border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {leavesError && (
              <div className="p-4 rounded-lg bg-red-50 border-2 border-red-200 text-red-700 text-sm">
                {leavesError}
              </div>
            )}

            {loadingLeaves ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading leave requests...
              </div>
            ) : allLeaves.length === 0 ? (
              <div className="bg-white border-2 border-gray-100 rounded-xl p-12 text-center">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No Leave Requests</h3>
                <p className="text-gray-500">Faculty leave requests will appear here when submitted</p>
              </div>
            ) : (
              <>
                {/* Pending Leaves */}
                {pendingLeaves.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-yellow-700 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Pending Requests ({pendingLeaves.length})
                    </h3>
                    {pendingLeaves.map(leave => (
                      <div
                        key={leave.leave_id}
                        className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-5 hover:border-yellow-300 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm font-bold text-gray-900">
                                {leave.faculty?.faculty_name || 'Faculty'}
                              </span>
                              {leave.faculty?.email && (
                                <span className="text-xs text-gray-500">{leave.faculty.email}</span>
                              )}
                              {getStatusBadge(leave.status)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <p className="text-sm text-gray-600">{leave.reason}</p>
                            {leave.proof_image_url && (
                              <div className="mt-2 p-3 bg-white border border-yellow-300 rounded-lg">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-gray-700">Uploaded Proof</p>
                                  <a
                                    href={leave.proof_image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                                  >
                                    Open Link <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                                {isImageProof(leave.proof_image_url) ? (
                                  <a href={leave.proof_image_url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={leave.proof_image_url}
                                      alt="Leave proof"
                                      className="mt-2 h-24 w-auto rounded border border-gray-200 object-cover"
                                    />
                                  </a>
                                ) : isPdfProof(leave.proof_image_url) ? (
                                  <p className="text-xs text-gray-600 mt-2">
                                    PDF proof uploaded. Click <span className="font-semibold">Open Link</span> to view.
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-600 mt-2 break-all">
                                    {leave.proof_image_url}
                                  </p>
                                )}
                              </div>
                            )}
                            {leave.created_at && (
                              <p className="text-xs text-gray-500">
                                Submitted {new Date(leave.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleLeaveAction(leave.leave_id, 'APPROVED')}
                              disabled={actionLoading === leave.leave_id}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === leave.leave_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleLeaveAction(leave.leave_id, 'REJECTED')}
                              disabled={actionLoading === leave.leave_id}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                              {actionLoading === leave.leave_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <X className="w-3.5 h-3.5" />
                              )}
                              Reject
                            </button>
                            <button
                              onClick={() => handleLeaveAction(leave.leave_id, 'DELETE')}
                              disabled={actionLoading === leave.leave_id}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Processed Leaves */}
                {processedLeaves.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-600 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Processed Requests ({processedLeaves.length})
                    </h3>
                    {processedLeaves.map(leave => (
                      <div
                        key={leave.leave_id}
                        className="bg-white border-2 border-gray-100 rounded-xl p-5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm font-bold text-gray-900">
                                {leave.faculty?.faculty_name || 'Faculty'}
                              </span>
                              {leave.faculty?.email && (
                                <span className="text-xs text-gray-500">{leave.faculty.email}</span>
                              )}
                              {getStatusBadge(leave.status)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <p className="text-sm text-gray-500">{leave.reason}</p>
                            {leave.proof_image_url && (
                              <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-gray-700">Uploaded Proof</p>
                                  <a
                                    href={leave.proof_image_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                                  >
                                    Open Link <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                                {isImageProof(leave.proof_image_url) ? (
                                  <a href={leave.proof_image_url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={leave.proof_image_url}
                                      alt="Leave proof"
                                      className="mt-2 h-20 w-auto rounded border border-gray-200 object-cover"
                                    />
                                  </a>
                                ) : isPdfProof(leave.proof_image_url) ? (
                                  <p className="text-xs text-gray-600 mt-2">
                                    PDF proof uploaded. Click <span className="font-semibold">Open Link</span> to view.
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-600 mt-2 break-all">
                                    {leave.proof_image_url}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleLeaveAction(leave.leave_id, 'DELETE')}
                            disabled={actionLoading === leave.leave_id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                          >
                            {actionLoading === leave.leave_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 'analytics':
        return (
          <div className="w-full max-w-6xl space-y-6">
            {/* Analytics Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-200">
                  <BarChart3 className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Department Analytics</h2>
                  <p className="text-gray-600 text-sm">Insights into scheduling, workload, and resource utilization</p>
                </div>
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={loadingAnalytics}
                className="px-4 py-2 text-sm font-semibold text-teal-700 border-2 border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
              >
                {loadingAnalytics ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading analytics...
              </div>
            ) : (
              <>
                {/* Leave Statistics */}
                {analytics.leaveStats && (
                  <div className="bg-white border-2 border-gray-100 rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-teal-600" />
                      Leave Statistics
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-gray-600">Total Leaves</p>
                        <p className="text-2xl font-bold text-gray-900">{analytics.leaveStats.total_leaves}</p>
                      </div>
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-yellow-700">Pending</p>
                        <p className="text-2xl font-bold text-yellow-800">{analytics.leaveStats.pending}</p>
                      </div>
                      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-green-700">Approved</p>
                        <p className="text-2xl font-bold text-green-800">{analytics.leaveStats.approved}</p>
                      </div>
                      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-red-700">Rejected</p>
                        <p className="text-2xl font-bold text-red-800">{analytics.leaveStats.rejected}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Faculty Workload */}
                <div className="bg-white border-2 border-gray-100 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    Faculty Workload Distribution
                  </h3>
                  {analytics.facultyWorkload.length === 0 ? (
                    <p className="text-gray-600 text-sm">No workload data available</p>
                  ) : (
                    <div className="space-y-3">
                      {analytics.facultyWorkload.slice(0, 10).map((faculty) => (
                        <div key={faculty.faculty_id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{faculty.faculty_name}</p>
                              <p className="text-xs text-gray-500">{faculty.email}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                {faculty.total_slots} / {faculty.max_load} slots
                              </p>
                              <p className={`text-xs font-medium ${
                                faculty.utilization_percentage > 90 ? 'text-red-600' :
                                faculty.utilization_percentage > 70 ? 'text-yellow-600' :
                                'text-green-600'
                              }`}>
                                {faculty.utilization_percentage}% utilized
                              </p>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                faculty.utilization_percentage > 90 ? 'bg-red-500' :
                                faculty.utilization_percentage > 70 ? 'bg-yellow-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(faculty.utilization_percentage, 100)}%` }}
                            />
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-gray-600">
                            <span>Theory: {faculty.theory_slots}</span>
                            <span>Lab: {faculty.lab_slots}</span>
                            <span>Tutorial: {faculty.tutorial_slots}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Room Utilization */}
                <div className="bg-white border-2 border-gray-100 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-teal-600" />
                    Room Utilization
                  </h3>
                  {analytics.roomUtilization.length === 0 ? (
                    <p className="text-gray-600 text-sm">No room utilization data available</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analytics.roomUtilization.slice(0, 8).map((room) => (
                        <div key={room.room_id} className="bg-gray-50 rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{room.room_name}</p>
                              <p className="text-xs text-gray-500">{room.room_type} • Capacity: {room.capacity}</p>
                            </div>
                            <p className={`text-sm font-semibold ${
                              room.utilization_percentage > 70 ? 'text-green-600' :
                              room.utilization_percentage > 40 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {room.utilization_percentage}%
                            </p>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                room.utilization_percentage > 70 ? 'bg-green-500' :
                                room.utilization_percentage > 40 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${room.utilization_percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-600">
                            {room.used_slots} / {room.total_possible_slots} slots used
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timetable Conflicts */}
                <div className="bg-white border-2 border-gray-100 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Timetable Conflicts
                  </h3>
                  {analytics.conflicts.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
                      <p className="text-green-700 font-medium">No conflicts detected!</p>
                      <p className="text-gray-500 text-sm">Your timetable is conflict-free</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analytics.conflicts.map((conflict, idx) => (
                        <div key={idx} className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-red-700">
                                {conflict.type === 'FACULTY_DOUBLE_BOOKING' ? 'Faculty Double Booking' : 'Room Double Booking'}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                {conflict.entry_count} entries scheduled in the same slot
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Day: {conflict.day_id} • Slot: {conflict.slot_id}
                              </p>
                            </div>
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                              {conflict.severity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );

      case 'profile':
        return <FacultyProfile />;

      default:
        return null;
    }
  };

  if (loading) {
    return null; // RoleGuard handles the loading state
  }

  return (
    <RoleGuard allowedRole="HOD">
      <div className="min-h-screen bg-white">
        <DashboardNavbar
          role="hod"
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
              {error && (
                <div className="w-full mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700">
                  {error}
                </div>
              )}
              {renderContent()}
            </DashboardCard>
          </div>
        </DashboardLayout>
      </div>
    </RoleGuard>
  );
}
