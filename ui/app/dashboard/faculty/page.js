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
  const [slotModal, setSlotModal] = useState({ open: false, leaveId: null, requestId: null, loading: false, slots: [] });
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loadingIncoming, setLoadingIncoming] = useState(false);
  const [assigningSlotId, setAssigningSlotId] = useState(null);

  const navItems = [
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'apply-leave', label: 'Apply Leave', icon: FilePlus },
    { id: 'my-leaves', label: 'My Leaves', icon: FileText },
    { id: 'slot-adjustments', label: 'Slot Adjustments', icon: AlertCircle },
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
        const token = localStorage.getItem('authToken') || '';
        const authHdr = token ? { Authorization: `Bearer ${token}` } : {};
        const [facultyRes, versionsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/faculty`, { headers: authHdr }),
          fetch(`${API_BASE_URL}/timetable-versions`, { headers: authHdr }),
        ]);

        const facultyData = await facultyRes.json();
        const allFaculty = facultyData.data || [];
        setFacultyList(allFaculty);

        const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: authHdr,
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

  const fetchIncomingRequests = useCallback(async () => {
    try {
      setLoadingIncoming(true);
      const token = localStorage.getItem('authToken') || '';
      const query = selectedFacultyId ? `?faculty_id=${encodeURIComponent(selectedFacultyId)}` : '';
      const res = await fetch(`${API_BASE_URL}/slot-adjustments/incoming-requests${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch incoming slot requests');
      const data = await res.json();
      setIncomingRequests(data.data || []);
    } catch (err) {
      setLeavesError(err.message);
    } finally {
      setLoadingIncoming(false);
    }
  }, [selectedFacultyId]);

  // Fetch data when tab switches or faculty changes
  useEffect(() => {
    if (activeTab === 'my-leaves' && selectedFacultyId) {
      fetchMyLeaves();
    }
    if (activeTab === 'slot-adjustments') {
      fetchMyLeaves();
      fetchAffectedSlots();
      fetchIncomingRequests();
    }
  }, [activeTab, selectedFacultyId, fetchMyLeaves, fetchAffectedSlots, fetchIncomingRequests]);

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

    // Validate file type (image or PDF)
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      setLeaveError('Please upload an image or PDF file');
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
      setLeavesError(null);
      const token = localStorage.getItem('authToken') || '';
      setSlotModal({ open: true, leaveId, requestId: null, loading: true, slots: [] });

      const affectedRes = await fetch(
        `${API_BASE_URL}/faculty-leaves/${leaveId}/affected-slots`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!affectedRes.ok) {
        throw new Error('Failed to fetch affected slots');
      }
      const affectedData = await affectedRes.json();
      const slots = affectedData.data?.affected_entries || [];
      if (slots.length === 0) throw new Error('No affected slots found for this leave.');
      const entryIds = slots.map((slot) => slot.entry_id);
      let requestId = null;
      const createRes = await fetch(`${API_BASE_URL}/slot-adjustments/create`, {
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

      if (createRes.ok) {
        const createData = await createRes.json();
        requestId = createData.data?.request_id;
      } else {
        const createErr = await createRes.json().catch(() => ({}));
        const detail = String(createErr?.detail || '');
        if (createRes.status === 409 || detail.toLowerCase().includes('already exists')) {
          // Reuse existing request so user can reopen modal and edit assignments.
          const listRes = await fetch(`${API_BASE_URL}/slot-adjustments/requests`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!listRes.ok) throw new Error('Failed to load existing adjustment requests');
          const listData = await listRes.json();
          const existing = (listData.data || []).find((r) => String(r.leave_id) === String(leaveId));
          requestId = existing?.request_id || null;
        } else {
          throw new Error(createErr.detail || 'Failed to initialize slot adjustment request');
        }
      }

      const requestSlotsRes = await fetch(
        `${API_BASE_URL}/slot-adjustments/requests/${requestId}/affected-slots`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!requestSlotsRes.ok) throw new Error('Failed to load faculty availability for affected slots');
      const requestSlotsData = await requestSlotsRes.json();
      const modalSlots = (requestSlotsData.data || []).map((slot) => ({
        ...slot,
        replacement_faculty_id: slot.replacement_faculty_id || '',
      }));
      setSlotModal({
        open: true,
        leaveId,
        requestId,
        loading: false,
        slots: modalSlots,
      });
    } catch (err) {
      setSlotModal({ open: false, leaveId: null, requestId: null, loading: false, slots: [] });
      setLeavesError(err.message);
    }
  };

  const submitSlotAdjustments = async () => {
    try {
      const token = localStorage.getItem('authToken') || '';
      for (const slot of slotModal.slots) {
        if (!slot?.affected_slot_id) continue;
        await fetch(`${API_BASE_URL}/slot-adjustments/assign-replacement`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            affected_slot_id: slot.affected_slot_id,
            replacement_faculty_id: slot.replacement_faculty_id || null,
          }),
        });
      }

      setLeaveSuccess('Slot adjustment requests submitted. Assigned faculty can now accept or reject.');
      setSlotModal({ open: false, leaveId: null, requestId: null, loading: false, slots: [] });
      fetchAffectedSlots();
      fetchIncomingRequests();
    } catch (err) {
      setLeavesError(err.message);
    }
  };

  const handleAssignFromAffectedGrid = async (affectedSlotId, replacementFacultyId) => {
    try {
      setAssigningSlotId(affectedSlotId);
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(`${API_BASE_URL}/slot-adjustments/assign-replacement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          affected_slot_id: affectedSlotId,
          replacement_faculty_id: replacementFacultyId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to assign faculty');
      }
      fetchAffectedSlots();
      fetchIncomingRequests();
    } catch (err) {
      setLeavesError(err.message);
    } finally {
      setAssigningSlotId(null);
    }
  };

  const decideIncomingRequest = async (affectedSlotId, decision) => {
    try {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(`${API_BASE_URL}/slot-adjustments/faculty-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ affected_slot_id: affectedSlotId, decision }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to submit decision');
      }
      fetchIncomingRequests();
      fetchAffectedSlots();
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

  const formatSlotStatus = (status) => {
    if (status === 'NO_REPLACEMENT') return 'FREE_SLOT';
    return status || 'PENDING';
  };

  const renderFacultySelector = () => (
    <div className="mb-6 bg-gradient-to-r from-teal-50 to-indigo-50 border-2 border-teal-200 rounded-xl px-6 py-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <label className="text-sm font-semibold text-teal-700 whitespace-nowrap">
          Your Faculty Profile:
        </label>
        <select
          value={selectedFacultyId}
          onChange={handleFacultySelect}
          className="flex-1 max-w-md bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer"
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
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-200">
                  <FilePlus className="w-5 h-5 text-teal-600" />
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
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
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
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
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
                    className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all appearance-none cursor-pointer"
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
                    className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Proof Image <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-3 px-4 text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-700 file:cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all disabled:opacity-50"
                    />
                    {uploadingImage && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                      </div>
                    )}
                  </div>
                  {imageFile && leaveForm.proof_image_url && (
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Image uploaded successfully
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Upload medical certificate, appointment letter, or other proof (Image/PDF, Max 5MB)</p>
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
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-200">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">My Leave Requests</h2>
                    <p className="text-gray-600 text-sm">Track the status of your submitted leave requests</p>
                  </div>
                </div>
                <button
                  onClick={fetchMyLeaves}
                  disabled={loadingLeaves || !selectedFacultyId}
                  className="px-4 py-2 text-xs font-semibold text-teal-700 border-2 border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'slot-adjustments':
        return (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Slot Adjustments</h2>
                  <p className="text-sm text-gray-600">Adjust your affected slots and respond to incoming replacement requests.</p>
                </div>
                <button
                  onClick={() => { fetchMyLeaves(); fetchAffectedSlots(); fetchIncomingRequests(); }}
                  disabled={loadingLeaves || loadingAffectedSlots || loadingIncoming}
                  className="px-4 py-2 text-xs font-semibold text-teal-700 border-2 border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
                >
                  Refresh All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900">1) Approved Leaves To Adjust</h3>
                  <p className="text-xs text-gray-600">Pick an approved leave and open adjustment modal.</p>
                </div>
                {loadingLeaves ? (
                  <div className="py-8 flex items-center justify-center gap-2 text-gray-600 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading approved leaves...
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-auto pr-1">
                    {myLeaves.filter((leave) => leave.status === 'APPROVED').length === 0 ? (
                      <p className="text-sm text-gray-500">No approved leaves available for adjustment.</p>
                    ) : (
                      myLeaves
                        .filter((leave) => leave.status === 'APPROVED')
                        .map((leave) => (
                          <div key={leave.leave_id} className="bg-gray-50 border-2 border-gray-100 rounded-xl p-4">
                            <p className="text-sm font-semibold text-gray-900">
                              {new Date(leave.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' → '}
                              {new Date(leave.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">{leave.reason}</p>
                            <button
                              onClick={() => handleRequestAdjustment(leave.leave_id)}
                              className="mt-3 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-2"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Adjust Slots
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900">2) My Affected Slots</h3>
                  <p className="text-xs text-gray-600">Track your adjustment request progress and status.</p>
                </div>
                {loadingAffectedSlots ? (
                  <div className="py-8 flex items-center justify-center gap-2 text-gray-600 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading affected slots...
                  </div>
                ) : affectedSlots.length === 0 ? (
                  <p className="text-sm text-gray-500">No affected-slot requests yet.</p>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-auto pr-1">
                    {affectedSlots.map((request) => (
                      <div key={request.request_id} className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-900">Request {request.status}</p>
                          <span className="text-xs text-gray-700">
                            {request.resolved_slots}/{request.total_affected_slots}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(request.affected_slots || []).map((slot) => (
                            <div key={slot.affected_slot_id} className="bg-white border border-gray-200 rounded-lg p-2.5 text-xs">
                              <p className="text-gray-900 font-medium">
                                {slot.days?.day_name} | {slot.time_slots?.start_time} - {slot.time_slots?.end_time}
                              </p>
                              <p className="text-gray-600">
                                {slot.subjects?.subject_name} | {slot.divisions?.division_name}
                              </p>
                              <p className="text-gray-700 mt-1">
                                Status: <span className="font-semibold">{formatSlotStatus(slot.status)}</span>
                              </p>
                              <div className="mt-2">
                                <select
                                  value={slot.replacement_faculty_id || ''}
                                  onChange={(e) => handleAssignFromAffectedGrid(slot.affected_slot_id, e.target.value)}
                                  disabled={assigningSlotId === slot.affected_slot_id}
                                  className="w-full bg-white border border-gray-300 rounded-lg py-1.5 px-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
                                >
                                  <option value="">Mark as free slot</option>
                                  {(slot.available_faculty || []).map((opt) => {
                                    const facultyId = opt?.faculty?.faculty_id || opt?.faculty_id;
                                    const facultyName = opt?.faculty?.faculty_name || opt?.faculty_name || 'Faculty';
                                    const markers = [];
                                    markers.push(opt.is_free ? 'Free' : 'Busy');
                                    if (opt.teaches_division && opt.teaches_subject) {
                                      markers.push('Best match');
                                    } else {
                                      if (opt.teaches_division) markers.push('Teaches division');
                                      if (opt.teaches_subject) markers.push('Teaches same subject');
                                    }
                                    return (
                                      <option key={facultyId} value={facultyId}>
                                        {facultyName} ({markers.join(' | ')})
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">3) Incoming Slot Requests</h3>
                <p className="text-xs text-gray-600">Accept or reject requests where you are the replacement faculty.</p>
              </div>
              {loadingIncoming ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading incoming requests...
                </div>
              ) : incomingRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium text-gray-600">No pending requests for you</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incomingRequests.map((req) => (
                    <div key={req.affected_slot_id} className="bg-gray-50 border-2 border-gray-100 rounded-xl p-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-4">
                        <p><span className="text-gray-500">Division:</span> <span className="font-medium">{req.divisions?.division_name}</span></p>
                        <p><span className="text-gray-500">Subject:</span> <span className="font-medium">{req.subjects?.subject_name}</span></p>
                        <p><span className="text-gray-500">Day:</span> <span className="font-medium">{req.days?.day_name}</span></p>
                        <p><span className="text-gray-500">Time:</span> <span className="font-medium">{req.time_slots?.start_time} - {req.time_slots?.end_time}</span></p>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Requested by {req.original_faculty?.faculty_name || 'faculty'}.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => decideIncomingRequest(req.affected_slot_id, 'ACCEPT')}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => decideIncomingRequest(req.affected_slot_id, 'REJECT')}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
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
                <div className="mb-6 bg-gradient-to-r from-teal-50 to-indigo-50 border-2 border-teal-200 rounded-xl px-6 py-4">
                  <p className="text-sm text-teal-700">
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
      {slotModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-4xl max-h-[85vh] overflow-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Request Slot Adjustment</h3>
              <button
                onClick={() => setSlotModal({ open: false, leaveId: null, requestId: null, loading: false, slots: [] })}
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            {slotModal.loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-gray-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading affected slots...
              </div>
            ) : (
              <div className="space-y-3">
                {leavesError && (
                  <div className="p-3 rounded-lg bg-red-50 border-2 border-red-200 text-red-700 text-sm">
                    {leavesError}
                  </div>
                )}
                {slotModal.slots.map((slot) => (
                  <div key={slot.entry_id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                      <p><span className="text-gray-500">Division:</span> <span className="font-medium">{slot.divisions?.division_name}</span></p>
                      <p><span className="text-gray-500">Subject:</span> <span className="font-medium">{slot.subjects?.subject_name}</span></p>
                      <p><span className="text-gray-500">Day:</span> <span className="font-medium">{slot.days?.day_name}</span></p>
                      <p><span className="text-gray-500">Time:</span> <span className="font-medium">{slot.time_slots?.start_time} - {slot.time_slots?.end_time}</span></p>
                    </div>
                    <select
                      value={slot.replacement_faculty_id || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSlotModal((prev) => ({
                          ...prev,
                          slots: prev.slots.map((s) => s.entry_id === slot.entry_id ? { ...s, replacement_faculty_id: value } : s),
                        }));
                      }}
                      className="w-full bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">Keep as free slot</option>
                      {(slot.available_faculty || []).map((opt) => {
                        const facultyId = opt?.faculty?.faculty_id || opt?.faculty_id;
                        const facultyName = opt?.faculty?.faculty_name || opt?.faculty_name || 'Faculty';
                        const markers = [];
                        markers.push(opt.is_free ? 'Free' : 'Busy');
                        if (opt.teaches_division && opt.teaches_subject) {
                          markers.push('Best match');
                        } else {
                          if (opt.teaches_division) markers.push('Teaches division');
                          if (opt.teaches_subject) markers.push('Teaches same subject');
                        }
                        return (
                          <option key={facultyId} value={facultyId}>
                            {facultyName} ({markers.join(' | ')})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={submitSlotAdjustments}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg"
                  >
                    Submit Adjustment Request
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
