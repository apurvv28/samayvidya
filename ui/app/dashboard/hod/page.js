'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackgroundBeams } from '../../components/ui/BackgroundBeams';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import FacultyProfile from '../../components/Dashboard/FacultyProfile';
import RoleGuard from '../../components/RoleGuard';
import {
  CheckCircle2, Calendar, Users, BarChart3, AlertCircle,
  FileText, Loader2, XCircle, Clock, Trash2, Check, X
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function HODDashboard() {
  const router = useRouter();
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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/15 text-green-400 text-xs font-semibold border border-green-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 text-red-400 text-xs font-semibold border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-semibold border border-yellow-500/20">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  };

  const pendingLeaves = allLeaves.filter(l => l.status === 'PENDING');
  const processedLeaves = allLeaves.filter(l => l.status !== 'PENDING');

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-8 w-full max-w-6xl">
            {/* Header */}
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                Head of Department Dashboard
              </h1>
              <p className="text-gray-400">
                Monitor timetables and manage faculty leave requests for your department
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-400">Approved Timetables</h3>
                  <CheckCircle2 className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-white">{stats.approvedTimetables}</p>
              </div>

              <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border border-yellow-500/20 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-400">Pending Leaves</h3>
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                </div>
                <p className="text-3xl font-bold text-white">{pendingLeaves.length}</p>
              </div>

              <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-400">Faculty Members</h3>
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <p className="text-3xl font-bold text-white">{stats.facultyCount}</p>
              </div>

              <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-400">Timetable Versions</h3>
                  <Calendar className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-3xl font-bold text-white">{timetableVersions.length}</p>
              </div>
            </div>

            {/* Recent Timetables */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                Recent Timetables
              </h2>
              
              {timetableVersions.length === 0 ? (
                <p className="text-gray-400">No timetables yet</p>
              ) : (
                <div className="space-y-3">
                  {timetableVersions.slice(0, 5).map(version => (
                    <div key={version.version_id} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer">
                      <div className="space-y-1">
                        <p className="font-medium text-white">Version {version.version_number || 'N/A'}</p>
                        <p className="text-sm text-gray-400">
                          Created {new Date(version.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-full text-sm font-medium">
                        {version.status || 'draft'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-semibold text-white">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('leaves')}
                  className="p-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-lg font-medium transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  Review Leave Requests ({pendingLeaves.length} pending)
                </button>
                <button
                  onClick={() => setActiveTab('timetable')}
                  className="p-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg font-medium transition-all transform hover:scale-105 flex items-center justify-center gap-2"
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
            />
          </div>
        );

      case 'leaves':
        return (
          <div className="w-full max-w-6xl space-y-6">
            {/* Leave Management Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                  <FileText className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Faculty Leave Management</h2>
                  <p className="text-gray-400 text-sm">Review, approve, or reject faculty leave requests</p>
                </div>
              </div>
              <button
                onClick={fetchAllLeaves}
                disabled={loadingLeaves}
                className="px-4 py-2 text-sm font-semibold text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {leavesError && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {leavesError}
              </div>
            )}

            {loadingLeaves ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading leave requests...
              </div>
            ) : allLeaves.length === 0 ? (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-12 text-center">
                <FileText className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">No Leave Requests</h3>
                <p className="text-gray-500">Faculty leave requests will appear here when submitted</p>
              </div>
            ) : (
              <>
                {/* Pending Leaves */}
                {pendingLeaves.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-yellow-400 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Pending Requests ({pendingLeaves.length})
                    </h3>
                    {pendingLeaves.map(leave => (
                      <div
                        key={leave.leave_id}
                        className="bg-gradient-to-r from-yellow-900/10 to-orange-900/5 border border-yellow-500/15 rounded-xl p-5 hover:border-yellow-500/30 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm font-bold text-white">
                                {leave.faculty?.faculty_name || 'Faculty'}
                              </span>
                              {leave.faculty?.email && (
                                <span className="text-xs text-gray-500">{leave.faculty.email}</span>
                              )}
                              {getStatusBadge(leave.status)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <p className="text-sm text-gray-400">{leave.reason}</p>
                            {leave.created_at && (
                              <p className="text-xs text-gray-600">
                                Submitted {new Date(leave.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleLeaveAction(leave.leave_id, 'APPROVED')}
                              disabled={actionLoading === leave.leave_id}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600/80 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
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
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
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
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-700/80 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
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
                    <h3 className="text-lg font-semibold text-gray-400 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Processed Requests ({processedLeaves.length})
                    </h3>
                    {processedLeaves.map(leave => (
                      <div
                        key={leave.leave_id}
                        className="bg-gray-900/40 border border-white/5 rounded-xl p-5 hover:bg-gray-900/60 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-sm font-bold text-white">
                                {leave.faculty?.faculty_name || 'Faculty'}
                              </span>
                              {leave.faculty?.email && (
                                <span className="text-xs text-gray-500">{leave.faculty.email}</span>
                              )}
                              {getStatusBadge(leave.status)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <Calendar className="w-4 h-4 text-gray-600" />
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <p className="text-sm text-gray-500">{leave.reason}</p>
                          </div>

                          <button
                            onClick={() => handleLeaveAction(leave.leave_id, 'DELETE')}
                            disabled={actionLoading === leave.leave_id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
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
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                  <BarChart3 className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Department Analytics</h2>
                  <p className="text-gray-400 text-sm">Insights into scheduling, workload, and resource utilization</p>
                </div>
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={loadingAnalytics}
                className="px-4 py-2 text-sm font-semibold text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              >
                {loadingAnalytics ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading analytics...
              </div>
            ) : (
              <>
                {/* Leave Statistics */}
                {analytics.leaveStats && (
                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-400" />
                      Leave Statistics
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-800/50 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-gray-400">Total Leaves</p>
                        <p className="text-2xl font-bold text-white">{analytics.leaveStats.total_leaves}</p>
                      </div>
                      <div className="bg-yellow-900/20 border border-yellow-500/20 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-yellow-400">Pending</p>
                        <p className="text-2xl font-bold text-yellow-300">{analytics.leaveStats.pending}</p>
                      </div>
                      <div className="bg-green-900/20 border border-green-500/20 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-green-400">Approved</p>
                        <p className="text-2xl font-bold text-green-300">{analytics.leaveStats.approved}</p>
                      </div>
                      <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 space-y-1">
                        <p className="text-sm text-red-400">Rejected</p>
                        <p className="text-2xl font-bold text-red-300">{analytics.leaveStats.rejected}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Faculty Workload */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    Faculty Workload Distribution
                  </h3>
                  {analytics.facultyWorkload.length === 0 ? (
                    <p className="text-gray-400 text-sm">No workload data available</p>
                  ) : (
                    <div className="space-y-3">
                      {analytics.facultyWorkload.slice(0, 10).map((faculty) => (
                        <div key={faculty.faculty_id} className="bg-gray-800/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-white">{faculty.faculty_name}</p>
                              <p className="text-xs text-gray-500">{faculty.email}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-white">
                                {faculty.total_slots} / {faculty.max_load} slots
                              </p>
                              <p className={`text-xs font-medium ${
                                faculty.utilization_percentage > 90 ? 'text-red-400' :
                                faculty.utilization_percentage > 70 ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>
                                {faculty.utilization_percentage}% utilized
                              </p>
                            </div>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                faculty.utilization_percentage > 90 ? 'bg-red-500' :
                                faculty.utilization_percentage > 70 ? 'bg-yellow-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(faculty.utilization_percentage, 100)}%` }}
                            />
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-gray-400">
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
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    Room Utilization
                  </h3>
                  {analytics.roomUtilization.length === 0 ? (
                    <p className="text-gray-400 text-sm">No room utilization data available</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analytics.roomUtilization.slice(0, 8).map((room) => (
                        <div key={room.room_id} className="bg-gray-800/30 rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-white">{room.room_name}</p>
                              <p className="text-xs text-gray-500">{room.room_type} • Capacity: {room.capacity}</p>
                            </div>
                            <p className={`text-sm font-semibold ${
                              room.utilization_percentage > 70 ? 'text-green-400' :
                              room.utilization_percentage > 40 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {room.utilization_percentage}%
                            </p>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                room.utilization_percentage > 70 ? 'bg-green-500' :
                                room.utilization_percentage > 40 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${room.utilization_percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400">
                            {room.used_slots} / {room.total_possible_slots} slots used
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timetable Conflicts */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    Timetable Conflicts
                  </h3>
                  {analytics.conflicts.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                      <p className="text-green-400 font-medium">No conflicts detected!</p>
                      <p className="text-gray-500 text-sm">Your timetable is conflict-free</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analytics.conflicts.map((conflict, idx) => (
                        <div key={idx} className="bg-red-900/10 border border-red-500/20 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-red-300">
                                {conflict.type === 'FACULTY_DOUBLE_BOOKING' ? 'Faculty Double Booking' : 'Room Double Booking'}
                              </p>
                              <p className="text-sm text-gray-400 mt-1">
                                {conflict.entry_count} entries scheduled in the same slot
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Day: {conflict.day_id} • Slot: {conflict.slot_id}
                              </p>
                            </div>
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded">
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
      <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
        <DashboardNavbar role="hod" activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 min-h-screen overflow-hidden">
          <BackgroundBeams className="opacity-20" />
          
          <div className="relative z-10 w-full flex flex-col items-center">
            {error && (
              <div className="w-full max-w-6xl mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                {error}
              </div>
            )}
            
            {renderContent()}
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
