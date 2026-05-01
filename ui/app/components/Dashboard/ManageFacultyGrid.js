'use client';

import { useState, useEffect } from 'react';
import { 
  Loader2, Users, FileText, RefreshCw, CheckCircle2, XCircle, 
  AlertCircle, UserPlus, ChevronDown, ChevronUp, Send 
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function ManageFacultyGrid() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [facultyList, setFacultyList] = useState([]);
  const [leaveApplications, setLeaveApplications] = useState([]);
  const [adjustmentRequests, setAdjustmentRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [affectedSlots, setAffectedSlots] = useState([]);
  
  // Add Faculty Form State
  const [addFacultyForm, setAddFacultyForm] = useState({
    faculty_name: '',
    email: '',
    phone: '',
    department_id: '',
    faculty_code: '',
    designation: 'Assistant Professor',
    qualification: '',
    experience_years: '',
    specialization: '',
    role: 'FACULTY',
    priority_level: 3,
    min_working_days: 5,
    max_working_days: 6,
    max_load_per_week: 20,
    target_theory_load: 0,
    target_lab_load: 0,
    target_tutorial_load: 0,
    target_other_load: 0,
    preferred_start_time: '09:00',
    preferred_end_time: '17:00',
    is_active: true,
  });
  const [departments, setDepartments] = useState([]);
  const [submittingFaculty, setSubmittingFaculty] = useState(false);
  const [facultySuccess, setFacultySuccess] = useState(null);
  const [facultyError, setFacultyError] = useState(null);

  // UI State
  const [showFacultyList, setShowFacultyList] = useState(false);
  const [expandedLeave, setExpandedLeave] = useState(null);
  const [expandedRequest, setExpandedRequest] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken') || '';
      
      const [facultyRes, leavesRes, requestsRes, deptRes] = await Promise.all([
        fetch(`${API_BASE_URL}/faculty`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/faculty-leaves?status=PENDING`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/slot-adjustments/requests`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/departments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const [facultyData, leavesData, requestsData, deptData] = await Promise.all([
        facultyRes.json(),
        leavesRes.json(),
        requestsRes.json(),
        deptRes.json(),
      ]);

      setFacultyList(facultyData.data || []);
      setLeaveApplications(leavesData.data || []);
      setAdjustmentRequests(requestsData.data || []);
      setDepartments(deptData.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFacultyChange = (e) => {
    const { name, value } = e.target;
    setAddFacultyForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddFacultySubmit = async (e) => {
    e.preventDefault();
    setFacultyError(null);
    setFacultySuccess(null);

    try {
      setSubmittingFaculty(true);
      const token = localStorage.getItem('authToken') || '';
      
      // Build payload with required fields, excluding extra fields not in backend model
      const payload = {
        faculty_code: addFacultyForm.faculty_code,
        faculty_name: addFacultyForm.faculty_name,
        email: addFacultyForm.email,
        phone: addFacultyForm.phone || null,
        designation: addFacultyForm.designation || 'Assistant Professor',
        role: addFacultyForm.role,
        priority_level: parseInt(addFacultyForm.priority_level),
        preferred_start_time: addFacultyForm.preferred_start_time,
        preferred_end_time: addFacultyForm.preferred_end_time,
        min_working_days: parseInt(addFacultyForm.min_working_days),
        max_working_days: parseInt(addFacultyForm.max_working_days),
        max_load_per_week: parseInt(addFacultyForm.max_load_per_week),
        department_id: addFacultyForm.department_id,
        target_theory_load: parseInt(addFacultyForm.target_theory_load),
        target_lab_load: parseInt(addFacultyForm.target_lab_load),
        target_tutorial_load: parseInt(addFacultyForm.target_tutorial_load),
        target_other_load: parseInt(addFacultyForm.target_other_load),
        is_active: addFacultyForm.is_active,
      };

      console.log('[MANAGE FACULTY] Submitting payload:', payload);

      const res = await fetch(`${API_BASE_URL}/faculty`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log('[MANAGE FACULTY] Response:', data);

      if (!res.ok) {
        // Handle Pydantic validation errors
        if (data.detail && Array.isArray(data.detail)) {
          const errorMessages = data.detail.map(err => {
            const field = err.loc ? err.loc.join('.') : 'unknown';
            return `${field}: ${err.msg}`;
          }).join(', ');
          throw new Error(errorMessages);
        }
        throw new Error(data.detail || 'Failed to add faculty');
      }

      setFacultySuccess('Faculty added successfully!');
      setAddFacultyForm({
        faculty_name: '',
        email: '',
        phone: '',
        department_id: '',
        faculty_code: '',
        designation: 'Assistant Professor',
        qualification: '',
        experience_years: '',
        specialization: '',
        role: 'FACULTY',
        priority_level: 3,
        min_working_days: 5,
        max_working_days: 6,
        max_load_per_week: 20,
        target_theory_load: 0,
        target_lab_load: 0,
        target_tutorial_load: 0,
        target_other_load: 0,
        preferred_start_time: '09:00',
        preferred_end_time: '17:00',
        is_active: true,
      });
      
      // Refresh faculty list
      fetchData();
    } catch (err) {
      setFacultyError(err.message);
    } finally {
      setSubmittingFaculty(false);
    }
  };

  const handleLeaveAction = async (leaveId, action, rejectionReason = null) => {
    try {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(`${API_BASE_URL}/faculty-leaves/${leaveId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(action === 'reject' ? { rejection_reason: rejectionReason } : {}),
      });

      if (!res.ok) {
        throw new Error(`Failed to ${action} leave`);
      }

      // Refresh data
      fetchData();
    } catch (error) {
      console.error(`Failed to ${action} leave:`, error);
      alert(error.message);
    }
  };

  const handleViewAffectedSlots = async (requestId) => {
    try {
      setSelectedRequest(requestId);
      setExpandedRequest(requestId);
      const token = localStorage.getItem('authToken') || '';
      
      const res = await fetch(
        `${API_BASE_URL}/slot-adjustments/requests/${requestId}/affected-slots`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        throw new Error('Failed to fetch affected slots');
      }

      const data = await res.json();
      setAffectedSlots(data.data || []);
    } catch (error) {
      console.error('Failed to fetch affected slots:', error);
      alert(error.message);
    }
  };

  const handleAssignReplacement = async (affectedSlotId, replacementFacultyId) => {
    try {
      const token = localStorage.getItem('authToken') || '';
      
      // Handle "none" string - convert to null
      const facultyId = (replacementFacultyId === 'none' || !replacementFacultyId) ? null : replacementFacultyId;
      
      const res = await fetch(`${API_BASE_URL}/slot-adjustments/assign-replacement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          affected_slot_id: affectedSlotId,
          replacement_faculty_id: facultyId,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to assign replacement');
      }

      // Refresh affected slots
      if (selectedRequest) {
        handleViewAffectedSlots(selectedRequest);
      }
      
      // Refresh requests
      fetchData();
    } catch (error) {
      console.error('Failed to assign replacement:', error);
      alert(error.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Section - Add Faculty */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">

        {facultySuccess && (
          <div className="mb-4 p-4 rounded-lg bg-green-50 border-2 border-green-200 text-green-700 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            {facultySuccess}
          </div>
        )}

        {facultyError && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 border-2 border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {facultyError}
          </div>
        )}

        <form onSubmit={handleAddFacultySubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            name="faculty_name"
            value={addFacultyForm.faculty_name}
            onChange={handleAddFacultyChange}
            placeholder="Faculty Name *"
            required
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <input
            type="email"
            name="email"
            value={addFacultyForm.email}
            onChange={handleAddFacultyChange}
            placeholder="Email *"
            required
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <input
            type="tel"
            name="phone"
            value={addFacultyForm.phone}
            onChange={handleAddFacultyChange}
            placeholder="Phone"
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <select
            name="department_id"
            value={addFacultyForm.department_id}
            onChange={handleAddFacultyChange}
            required
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          >
            <option value="">Select Department *</option>
            {departments.map(dept => (
              <option key={dept.department_id} value={dept.department_id}>
                {dept.department_name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="faculty_code"
            value={addFacultyForm.faculty_code}
            onChange={handleAddFacultyChange}
            placeholder="Faculty Code"
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <input
            type="text"
            name="designation"
            value={addFacultyForm.designation}
            onChange={handleAddFacultyChange}
            placeholder="Designation"
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <input
            type="text"
            name="qualification"
            value={addFacultyForm.qualification}
            onChange={handleAddFacultyChange}
            placeholder="Qualification"
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <input
            type="number"
            name="experience_years"
            value={addFacultyForm.experience_years}
            onChange={handleAddFacultyChange}
            placeholder="Experience (years)"
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          <input
            type="text"
            name="specialization"
            value={addFacultyForm.specialization}
            onChange={handleAddFacultyChange}
            placeholder="Specialization"
            className="bg-white border-2 border-gray-300 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:border-purple-600 transition-colors"
          />
          
          <div className="md:col-span-3 flex gap-4 justify-end">
            <button
              type="submit"
              disabled={submittingFaculty}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {submittingFaculty ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Add Faculty
            </button>
          </div>
        </form>
      </div>

      {/* Bottom Grid - 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Faculty List */}
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
          <button
            onClick={() => setShowFacultyList(!showFacultyList)}
            className="w-full flex items-center justify-between mb-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border-2 border-blue-200">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-900">Faculty List</h3>
                <p className="text-gray-600 text-xs">{facultyList.length} members</p>
              </div>
            </div>
            {showFacultyList ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
          </button>

          {showFacultyList && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {facultyList.map(faculty => (
                <div key={faculty.faculty_id} className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                  <p className="text-sm font-semibold text-gray-900">{faculty.faculty_name}</p>
                  <p className="text-xs text-gray-600">{faculty.email}</p>
                  {faculty.designation && (
                    <p className="text-xs text-gray-500 mt-1">{faculty.designation}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leave Applications */}
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center border-2 border-yellow-200">
                <FileText className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Leave Applications</h3>
                <p className="text-gray-600 text-xs">{leaveApplications.length} pending</p>
              </div>
            </div>
            <button onClick={fetchData} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {leaveApplications.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-8">No pending applications</p>
            ) : (
              leaveApplications.map(leave => (
                <div key={leave.leave_id} className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{leave.faculty?.faculty_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-600">
                        {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{leave.reason}</p>
                    </div>
                    <button
                      onClick={() => setExpandedLeave(expandedLeave === leave.leave_id ? null : leave.leave_id)}
                      className="text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {expandedLeave === leave.leave_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {expandedLeave === leave.leave_id && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => handleLeaveAction(leave.leave_id, 'approve')}
                        className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('Enter rejection reason:');
                          if (reason) handleLeaveAction(leave.leave_id, 'reject', reason);
                        }}
                        className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Slot Adjustment Requests */}
        <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center border-2 border-orange-200">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Slot Adjustments</h3>
                <p className="text-gray-600 text-xs">{adjustmentRequests.length} requests</p>
              </div>
            </div>
            <button onClick={fetchData} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {adjustmentRequests.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-8">No adjustment requests</p>
            ) : (
              adjustmentRequests.map(request => (
                <div key={request.request_id} className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{request.faculty?.faculty_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-600">
                        {request.resolved_slots}/{request.total_affected_slots} slots resolved
                      </p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${
                        request.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        request.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {request.status}
                      </span>
                    </div>
                    <button
                      onClick={() => handleViewAffectedSlots(request.request_id)}
                      className="text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {expandedRequest === request.request_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {expandedRequest === request.request_id && affectedSlots.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      {affectedSlots.map(slot => (
                        <div key={slot.affected_slot_id} className="bg-white border-2 border-gray-200 rounded p-2">
                          <div className="text-xs space-y-1 mb-2">
                            <p className="text-gray-900 font-medium">
                              {slot.days?.day_name} | {slot.time_slots?.start_time}-{slot.time_slots?.end_time}
                            </p>
                            <p className="text-gray-600">
                              {slot.subjects?.subject_name} - {slot.divisions?.division_name}
                            </p>
                          </div>
                          
                          {slot.status === 'PENDING' && (
                            <div className="space-y-1">
                              <select
                                onChange={(e) => handleAssignReplacement(slot.affected_slot_id, e.target.value)}
                                className="w-full bg-white border-2 border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:border-blue-600 focus:outline-none"
                                defaultValue=""
                              >
                                <option value="">Assign Faculty...</option>
                                {(slot.available_faculty || []).map(fac => (
                                  <option key={fac.faculty_id} value={fac.faculty.faculty_id}>
                                    {fac.faculty.faculty_name} {fac.is_free ? '✓ Free' : '✗ Busy'} 
                                    {fac.teaches_division && fac.teaches_subject ? ' (Best Match)' : 
                                     fac.teaches_division ? ' (Teaches Div)' : 
                                     fac.teaches_subject ? ' (Teaches Sub)' : ''}
                                  </option>
                                ))}
                                <option value="none">No Faculty Available</option>
                              </select>
                            </div>
                          )}
                          
                          {slot.status === 'ASSIGNED' && slot.replacement_faculty && (
                            <p className="text-xs text-green-700">✓ Covered by: {slot.replacement_faculty.faculty_name}</p>
                          )}
                          
                          {slot.status === 'NO_REPLACEMENT' && (
                            <p className="text-xs text-red-700">⚠ No faculty available</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
