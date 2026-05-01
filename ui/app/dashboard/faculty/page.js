'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import DashboardLayout, { DashboardCard } from '../../components/Dashboard/DashboardLayout';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import FacultyProfile from '../../components/Dashboard/FacultyProfile';
import RoleGuard from '../../components/RoleGuard';
import { useAuth } from '../../context/AuthContext';
import {
  Loader2, Calendar, FilePlus, FileText, CheckCircle2, XCircle,
  Clock, AlertCircle, Send, LogOut, UserCircle
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function FacultyDashboard() {
  const router = useRouter();
  const { signOut } = useAuth();
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
    leave_type: 'FULL_DAY',
    reason: '',
    proof_image_url: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(null);
  const [leaveError, setLeaveError] = useState(null);

  // My leaves state
  const [myLeaves, setMyLeaves] = useState([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [leavesError, setLeavesError] = useState(null);

  // Affected slots state
  const [affectedSlots, setAffectedSlots] = useState([]);
  const [loadingAffectedSlots, setLoadingAffectedSlots] = useState(false);

  const navItems = [
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'apply-leave', label: 'Apply Leave', icon: FilePlus },
    { id: 'my-leaves', label: 'My Leaves', icon: FileText },
    { id: 'profile', label: 'Profile', icon: UserCircle },
  ];

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

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

  const fetchMyLeaves = useCallback(async () => {
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
  }, [selectedFacultyId]);

  const fetchAffectedSlots = useCallback(async () => {
    if (!selectedFacultyId) return;
    try {
      setLoadingAffectedSlots(true);
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(
        `${API_BASE_URL}/slot-adjustments/my-affected-slots?faculty_id=${encodeURIComponent(selectedFacultyId)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) {
        throw new Error('Failed to fetch affected slots');
      }
      const data = await res.json();
      setAffectedSlots(data.data || []);
    } catch (err) {
      console.error('Failed to fetch affected slots:', err);
    } finally {
      setLoadingAffectedSlots(false);
    }
  }, [selectedFacultyId]);

  // Fetch my leaves when tab switches or faculty changes
  useEffect(() => {
    if (activeTab === 'my-leaves' && selectedFacultyId) {
      fetchMyLeaves();
      fetchAffectedSlots();
    }
  }, [activeTab, selectedFacultyId, fetchMyLeaves, fetchAffectedSlots]);

  const handleFacultySelect = (e) => {
    const id = e.target.value;
    setSelectedFacultyId(id);
    setSelectedFaculty(facultyList.find((f) => String(f.faculty_id) === String(id)) || null);
    localStorage.setItem('facultyId', id);
  };

  const handleLeaveChange = (e) => {
    setLeaveForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setLeaveError('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setLeaveError('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    setLeaveError(null);

    try {
      setUploadingImage(true);
      const token = localStorage.getItem('authToken') || '';
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/faculty-leaves/upload-proof`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to upload image');
      }

      const data = await res.json();
      setLeaveForm(prev => ({ ...prev, proof_image_url: data.data.public_url }));
    } catch (err) {
      setLeaveError(err.message);
      setImageFile(null);
    } finally {
      setUploadingImage(false);
    }
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

    if (!leaveForm.proof_image_url) {
      setLeaveError('Please upload proof image');
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
          leave_type: leaveForm.leave_type,
          reason: leaveForm.reason,
          proof_image_url: leaveForm.proof_image_url,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to submit leave request');
      }

      setLeaveSuccess('Leave request submitted successfully! Awaiting HOD approval.');
      setLeaveForm({ start_date: '', end_date: '', leave_type: 'FULL_DAY', reason: '', proof_image_url: '' });
      setImageFile(null);
    } catch (err) {
      setLeaveError(err.message);
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleRequestAdjustment = async (leaveId) => {
    try {
      setLeaveError(null);
      const token = localStorage.getItem('authToken') || '';
      
      // First, get affected slots
      const affectedRes = await fetch(
        `${API_BASE_URL}/faculty-leaves/${leaveId}/affected-slots`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!affectedRes.ok) {
        throw new Error('Failed to fetch affected slots');
      }
      
      const affectedData = await affectedRes.json();
      const entryIds = (affectedData.data?.affected_entries || []).map(e => e.entry_id);
      
      if (entryIds.length === 0) {
        setLeaveError('No timetable slots found for this leave period');
        return;
      }
      
      // Request adjustment
      const adjustRes = await fetch(`${API_BASE_URL}/slot-adjustments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          leave_id: leaveId,
          entry_ids: entryIds,
        }),
      });
      
      if (!adjustRes.ok) {
        const err = await adjustRes.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to request adjustment');
      }
      
      const adjustData = await adjustRes.json();
      setLeaveSuccess(
        `Adjustment request sent! ${adjustData.data?.affected_slots_count || 0} slots need coverage. Coordinator has been notified.`
      );
      
      // Refresh affected slots
      fetchAffectedSlots();
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setLeavesError(err.message);
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

  const renderFacultySelector = () => (
    <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl px-6 py-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <label className="text-sm font-semibold text-blue-700 whitespace-nowrap">
          Your Faculty Profile:
        </label>
        <select
          value={selectedFacultyId}
          onChange={handleFacultySelect}
          className="flex-1 max-w-md bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
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
          <div className="bg-white border-2 border-gray-100 rounded-2xl min-h-[60vh]">
            {selectedFacultyId ? (
              <TimetableViewer
                versionId={latestVersionId}
                onVersionChange={(newId) => setLatestVersionId(newId)}
                facultyFilterId={selectedFacultyId}
                showOnlyFacultyView={true}
              />
            ) : (
              <div className="flex items-center justify-center h-[60vh] text-gray-600">
                <div className="text-center space-y-2">
                  <Calendar className="w-12 h-12 mx-auto text-gray-400" />
                  <p>Please select your faculty profile to view timetable</p>
                </div>
              </div>
            )}
          </div>
        );

      case 'apply-leave':
        return (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-200">
                  <FilePlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Apply for Leave</h2>
                  <p className="text-gray-600 text-sm">Submit a leave request for HOD approval</p>
                </div>
              </div>

              {leaveSuccess && (
                <div className="mb-4 p-4 rounded-lg bg-green-50 border-2 border-green-200 text-green-700 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  {leaveSuccess}
                </div>
              )}

              {leaveError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border-2 border-red-200 text-red-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {leaveError}
                </div>
              )}

              <form onSubmit={handleLeaveSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Start Date
                    </label>
                    <input
                      type="date"
                      name="start_date"
                      value={leaveForm.start_date}
                      onChange={handleLeaveChange}
                      required
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      End Date
                    </label>
                    <input
                      type="date"
                      name="end_date"
                      value={leaveForm.end_date}
                      onChange={handleLeaveChange}
                      required
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Leave Type
                  </label>
                  <select
                    name="leave_type"
                    value={leaveForm.leave_type}
                    onChange={handleLeaveChange}
                    required
                    className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="FULL_DAY">Full Day</option>
                    <option value="HALF_DAY_FIRST">Half Day (First Half)</option>
                    <option value="HALF_DAY_SECOND">Half Day (Second Half)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Reason for Leave
                  </label>
                  <textarea
                    name="reason"
                    value={leaveForm.reason}
                    onChange={handleLeaveChange}
                    required
                    rows={4}
                    placeholder="Please provide a detailed reason for your leave request..."
                    className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Proof Image <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                    />
                    {uploadingImage && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      </div>
                    )}
                  </div>
                  {imageFile && leaveForm.proof_image_url && (
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Image uploaded successfully
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Upload medical certificate, appointment letter, or other proof (Max 5MB)</p>
                </div>

                <button
                  type="submit"
                  disabled={submittingLeave || !selectedFacultyId || uploadingImage}
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-200">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">My Leave Requests</h2>
                    <p className="text-gray-600 text-sm">Track the status of your submitted leave requests</p>
                  </div>
                </div>
                <button
                  onClick={fetchMyLeaves}
                  disabled={loadingLeaves || !selectedFacultyId}
                  className="px-4 py-2 text-xs font-semibold text-blue-700 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              {!selectedFacultyId && (
                <div className="text-center py-8 text-gray-600">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>Please select your faculty profile above to view your leaves.</p>
                </div>
              )}

              {leavesError && (
                <div className="mb-4 p-4 rounded-lg bg-red-50 border-2 border-red-200 text-red-700 text-sm">
                  {leavesError}
                </div>
              )}

              {loadingLeaves ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading leave requests...
                </div>
              ) : selectedFacultyId && myLeaves.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium text-gray-600">No leave requests yet</p>
                  <p className="text-sm mt-1">Submit a leave request from the &quot;Apply Leave&quot; tab</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myLeaves.map((leave) => (
                    <div
                      key={leave.leave_id}
                      className="bg-gray-50 border-2 border-gray-100 rounded-xl p-5 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {getStatusBadge(leave.status)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="px-2 py-1 bg-gray-200 rounded">
                              {leave.leave_type === 'FULL_DAY' ? 'Full Day' : 
                               leave.leave_type === 'HALF_DAY_FIRST' ? 'Half Day (First Half)' :
                               'Half Day (Second Half)'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{leave.reason}</p>
                          {leave.created_at && (
                            <p className="text-xs text-gray-500">
                              Submitted on {new Date(leave.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                          {leave.rejection_reason && leave.status === 'REJECTED' && (
                            <div className="mt-2 p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                              <p className="text-xs font-semibold text-red-700 mb-1">Rejection Reason:</p>
                              <p className="text-xs text-red-600">{leave.rejection_reason}</p>
                            </div>
                          )}
                        </div>
                        {leave.status === 'APPROVED' && (
                          <button
                            onClick={() => handleRequestAdjustment(leave.leave_id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Request Adjustment
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Affected Slots Section */}
              {affectedSlots.length > 0 && (
                <div className="mt-8 pt-8 border-t-2 border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    My Affected Slots
                  </h3>
                  <div className="space-y-4">
                    {affectedSlots.map((request) => (
                      <div key={request.request_id} className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Adjustment Request - {request.status}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Progress: {request.resolved_slots}/{request.total_affected_slots} slots resolved
                            </p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${
                            request.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' :
                            request.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}>
                            {request.status}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {request.affected_slots.map((slot) => (
                            <div key={slot.affected_slot_id} className="bg-white border-2 border-gray-100 rounded-lg p-3">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Day:</span>
                                  <span className="ml-2 text-gray-900 font-medium">{slot.days?.day_name}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Time:</span>
                                  <span className="ml-2 text-gray-900 font-medium">
                                    {slot.time_slots?.start_time} - {slot.time_slots?.end_time}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Subject:</span>
                                  <span className="ml-2 text-gray-900 font-medium">{slot.subjects?.subject_name}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Division:</span>
                                  <span className="ml-2 text-gray-900 font-medium">{slot.divisions?.division_name}</span>
                                </div>
                              </div>
                              {slot.replacement_faculty_id && slot.faculty && (
                                <div className="mt-2 pt-2 border-t-2 border-gray-100">
                                  <span className="text-xs text-green-700">
                                    ✓ Covered by: {slot.faculty.faculty_name}
                                  </span>
                                </div>
                              )}
                              {slot.status === 'NO_REPLACEMENT' && (
                                <div className="mt-2 pt-2 border-t-2 border-gray-100">
                                  <span className="text-xs text-red-700">
                                    ⚠ No faculty available for this slot
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'profile':
        return <FacultyProfile />;

      default:
        return null;
    }
  };

  return (
    <RoleGuard allowedRole="FACULTY">
      <div className="min-h-screen bg-white">
        <DashboardNavbar
          role="faculty"
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
              {loadingFaculty ? (
                <div className="mb-6 flex items-center gap-2 text-gray-600 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading faculty profiles...
                </div>
              ) : selectedFaculty ? (
                <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl px-6 py-4">
                  <p className="text-sm text-blue-700">
                    Signed in as <span className="font-semibold">{selectedFaculty.faculty_name}</span>
                    {selectedFaculty.email ? ` (${selectedFaculty.email})` : ''}
                  </p>
                </div>
              ) : (
                renderFacultySelector()
              )}

              {renderContent()}
            </DashboardCard>
          </div>
        </DashboardLayout>
      </div>
    </RoleGuard>
  );
}
