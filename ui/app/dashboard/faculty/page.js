'use client';

import { useState, useEffect } from 'react';
import { BackgroundBeams } from '../../components/ui/BackgroundBeams';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import RoleGuard from '../../components/RoleGuard';
import {
  Loader2, Calendar, FilePlus, FileText, CheckCircle2, XCircle,
  Clock, AlertCircle, Send
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function FacultyDashboard() {
  const [activeTab, setActiveTab] = useState('timetable');
  const [latestVersionId, setLatestVersionId] = useState(null);

  // Faculty info
  const [facultyList, setFacultyList] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [loadingFaculty, setLoadingFaculty] = useState(true);

  // Leave application state
  const [leaveForm, setLeaveForm] = useState({
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(null);
  const [leaveError, setLeaveError] = useState(null);

  // My leaves state
  const [myLeaves, setMyLeaves] = useState([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [leavesError, setLeavesError] = useState(null);

  // Fetch faculty list and timetable version
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingFaculty(true);
        const [facultyRes, versionsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/faculty`),
          fetch(`${API_BASE_URL}/timetable-versions`),
        ]);

        const facultyData = await facultyRes.json();
        const allFaculty = facultyData.data || [];
        setFacultyList(allFaculty);

        const token = localStorage.getItem('authToken') || '';
        const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = meRes.ok ? await meRes.json() : null;
        const userEmail = String(meData?.data?.email || '').toLowerCase();
        const ownFaculty = allFaculty.find((f) => String(f.email || '').toLowerCase() === userEmail) || null;
        if (ownFaculty?.faculty_id) {
          setSelectedFacultyId(ownFaculty.faculty_id);
          setSelectedFaculty(ownFaculty);
          localStorage.setItem('facultyId', ownFaculty.faculty_id);
        } else {
          const saved = localStorage.getItem('facultyId');
          if (saved) {
            setSelectedFacultyId(saved);
          }
        }

        const versionsData = await versionsRes.json();
        const versions = versionsData.data || [];
        if (versions.length > 0) {
          setLatestVersionId(versions[0].version_id);
        }
      } catch (err) {
        console.error('Failed to load faculty data:', err);
      } finally {
        setLoadingFaculty(false);
      }
    };
    fetchData();
  }, []);

  // Fetch my leaves when tab switches or faculty changes
  useEffect(() => {
    if (activeTab === 'my-leaves' && selectedFacultyId) {
      fetchMyLeaves();
    }
  }, [activeTab, selectedFacultyId]);

  const fetchMyLeaves = async () => {
    if (!selectedFacultyId) return;
    try {
      setLoadingLeaves(true);
      setLeavesError(null);
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(
        `${API_BASE_URL}/faculty-leaves/my?faculty_id=${encodeURIComponent(selectedFacultyId)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch leaves');
      }
      const data = await res.json();
      setMyLeaves(data.data || []);
    } catch (err) {
      setLeavesError(err.message);
    } finally {
      setLoadingLeaves(false);
    }
  };

  const handleFacultySelect = (e) => {
    const id = e.target.value;
    setSelectedFacultyId(id);
    setSelectedFaculty(facultyList.find((f) => String(f.faculty_id) === String(id)) || null);
    localStorage.setItem('facultyId', id);
  };

  const handleLeaveChange = (e) => {
    setLeaveForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    setLeaveError(null);
    setLeaveSuccess(null);

    if (!selectedFacultyId) {
      setLeaveError('Please select your faculty profile first');
      return;
    }

    if (!leaveForm.start_date || !leaveForm.end_date || !leaveForm.reason.trim()) {
      setLeaveError('All fields are required');
      return;
    }

    if (new Date(leaveForm.end_date) < new Date(leaveForm.start_date)) {
      setLeaveError('End date cannot be before start date');
      return;
    }

    try {
      setSubmittingLeave(true);
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(`${API_BASE_URL}/faculty-leaves`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          faculty_id: selectedFacultyId,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to submit leave request');
      }

      setLeaveSuccess('Leave request submitted successfully! Awaiting HOD approval.');
      setLeaveForm({ start_date: '', end_date: '', reason: '' });
    } catch (err) {
      setLeaveError(err.message);
    } finally {
      setSubmittingLeave(false);
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

  const renderFacultySelector = () => (
    <div className="mb-6 bg-gradient-to-r from-purple-900/30 to-indigo-900/20 border border-purple-500/20 rounded-xl px-6 py-4 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <label className="text-sm font-semibold text-purple-300 whitespace-nowrap">
          Your Faculty Profile:
        </label>
        <select
          value={selectedFacultyId}
          onChange={handleFacultySelect}
          className="flex-1 max-w-md bg-gray-950/60 border border-gray-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none cursor-pointer"
        >
          <option value="">Select your name</option>
          {facultyList.map(f => (
            <option key={f.faculty_id} value={f.faculty_id}>
              {f.faculty_name} {f.email ? `(${f.email})` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'timetable':
        return (
          <div className="bg-gray-900/50 border border-white/5 rounded-2xl min-h-[60vh] backdrop-blur-sm">
            <TimetableViewer
              versionId={latestVersionId}
              onVersionChange={(newId) => setLatestVersionId(newId)}
            />
          </div>
        );

      case 'apply-leave':
        return (
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                  <FilePlus className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Apply for Leave</h2>
                  <p className="text-gray-400 text-sm">Submit a leave request for HOD approval</p>
                </div>
              </div>

              {leaveSuccess && (
                <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  {leaveSuccess}
                </div>
              )}

              {leaveError && (
                <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {leaveError}
                </div>
              )}

              <form onSubmit={handleLeaveSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Start Date
                    </label>
                    <input
                      type="date"
                      name="start_date"
                      value={leaveForm.start_date}
                      onChange={handleLeaveChange}
                      required
                      className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      End Date
                    </label>
                    <input
                      type="date"
                      name="end_date"
                      value={leaveForm.end_date}
                      onChange={handleLeaveChange}
                      required
                      className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Reason for Leave
                  </label>
                  <textarea
                    name="reason"
                    value={leaveForm.reason}
                    onChange={handleLeaveChange}
                    required
                    rows={4}
                    placeholder="Please provide a detailed reason for your leave request..."
                    className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-3 px-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingLeave || !selectedFacultyId}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingLeave ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit Leave Request
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        );

      case 'my-leaves':
        return (
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">My Leave Requests</h2>
                    <p className="text-gray-400 text-sm">Track the status of your submitted leave requests</p>
                  </div>
                </div>
                <button
                  onClick={fetchMyLeaves}
                  disabled={loadingLeaves || !selectedFacultyId}
                  className="px-4 py-2 text-xs font-semibold text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              {!selectedFacultyId && (
                <div className="text-center py-8 text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p>Please select your faculty profile above to view your leaves.</p>
                </div>
              )}

              {leavesError && (
                <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {leavesError}
                </div>
              )}

              {loadingLeaves ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading leave requests...
                </div>
              ) : selectedFacultyId && myLeaves.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-700" />
                  <p className="text-lg font-medium text-gray-400">No leave requests yet</p>
                  <p className="text-sm mt-1">Submit a leave request from the "Apply Leave" tab</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myLeaves.map((leave) => (
                    <div
                      key={leave.leave_id}
                      className="bg-gray-800/40 border border-white/5 rounded-xl p-5 hover:bg-gray-800/60 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-semibold text-white">
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {getStatusBadge(leave.status)}
                          </div>
                          <p className="text-sm text-gray-400">{leave.reason}</p>
                          {leave.created_at && (
                            <p className="text-xs text-gray-600">
                              Submitted on {new Date(leave.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <RoleGuard allowedRole="FACULTY">
      <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
        <DashboardNavbar role="faculty" activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 min-h-screen overflow-hidden">
          <BackgroundBeams className="opacity-20" />
          
          <div className="relative z-10 w-full max-w-7xl mx-auto">
            {/* Faculty selector - always visible */}
            {loadingFaculty ? (
              <div className="mb-6 flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading faculty profiles...
              </div>
            ) : selectedFaculty ? (
              <div className="mb-6 bg-gradient-to-r from-purple-900/30 to-indigo-900/20 border border-purple-500/20 rounded-xl px-6 py-4 backdrop-blur-sm">
                <p className="text-sm text-purple-200">
                  Signed in as <span className="font-semibold">{selectedFaculty.faculty_name}</span>
                  {selectedFaculty.email ? ` (${selectedFaculty.email})` : ''}
                </p>
              </div>
            ) : (
              renderFacultySelector()
            )}

            {renderContent()}
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
