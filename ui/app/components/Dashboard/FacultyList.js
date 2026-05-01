'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Loader2, Mail, Phone, Briefcase, Shield, UserPlus, X, IdCard, User, Building2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = 'http://localhost:8000';

export default function FacultyList() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [faculty, setFaculty] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    faculty_code: '',
    faculty_name: '',
    email: '',
    phone: '',
    designation: 'Assistant Professor',
    role: 'FACULTY',
    priority_level: 3,
    max_load_per_week: 20,
    preferred_start_time: '09:00',
    preferred_end_time: '17:00',
    min_working_days: 5,
    max_working_days: 6,
    target_theory_load: 12,
    target_lab_load: 6,
    target_tutorial_load: 2,
  });

  const fetchFaculty = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/faculty`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.detail || 'Failed to fetch faculty');
      }

      setFaculty(json.data || []);
    } catch (error) {
      console.error('Error fetching faculty:', error);
      showToast('Failed to fetch faculty: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    
    if (!user?.department_id) {
      showToast('Department information not found. Please login again.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem('authToken');

      const payload = {
        ...formData,
        department_id: user.department_id,
        is_active: true,
      };

      const response = await fetch(`${API_BASE_URL}/faculty`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.detail || 'Failed to add faculty');
      }

      showToast(json.message || 'Faculty added successfully!', 'success');
      setShowAddModal(false);
      setFormData({
        faculty_code: '',
        faculty_name: '',
        email: '',
        phone: '',
        designation: 'Assistant Professor',
        role: 'FACULTY',
        priority_level: 3,
        max_load_per_week: 20,
        preferred_start_time: '09:00',
        preferred_end_time: '17:00',
        min_working_days: 5,
        max_working_days: 6,
        target_theory_load: 12,
        target_lab_load: 6,
        target_tutorial_load: 2,
      });
      
      // Refresh faculty list
      await fetchFaculty();
    } catch (error) {
      console.error('Error adding faculty:', error);
      showToast('Failed to add faculty: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'HOD':
        return 'bg-purple-600/20 text-purple-300 border-purple-500/30';
      case 'FACULTY':
        return 'bg-teal-600/20 text-teal-300 border-teal-500/30';
      default:
        return 'bg-gray-600/20 text-gray-300 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-400" />
            Faculty Members
          </h2>
          <p className="text-gray-400 mt-1">
            View all faculty members in your department
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Total: <span className="text-white font-semibold">{faculty.length}</span> faculty members
          </div>
          <button
            onClick={() => {
              setShowAddModal(true);
              // Scroll to top when modal opens
              setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors"
          >
            <UserPlus className="w-5 h-5" />
            Add Faculty
          </button>
        </div>
      </div>

      {faculty.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center backdrop-blur-sm">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No Faculty Found</h3>
          <p className="text-gray-500">
            No faculty members have been added to your department yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {faculty.map((member) => (
            <div
              key={member.faculty_id}
              className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 backdrop-blur-sm hover:border-indigo-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10"
            >
              {/* Header with Role Badge */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {member.faculty_name}
                  </h3>
                  <p className="text-sm text-gray-400 font-mono">
                    {member.faculty_code}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(
                    member.role
                  )}`}
                >
                  {member.role}
                </span>
              </div>

              {/* Designation */}
              {member.designation && (
                <div className="flex items-center gap-2 mb-3 text-sm text-gray-300">
                  <Briefcase className="w-4 h-4 text-gray-500" />
                  <span>{member.designation}</span>
                </div>
              )}

              {/* Contact Information */}
              <div className="space-y-2 mb-4">
                {member.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </div>
                )}
                {member.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                    <span>{member.phone}</span>
                  </div>
                )}
              </div>

              {/* Load Information */}
              <div className="pt-4 border-t border-gray-800">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-gray-500 mb-1">Max Load/Week</p>
                    <p className="text-white font-semibold">
                      {member.max_load_per_week || 0} hrs
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Priority</p>
                    <p className="text-white font-semibold">
                      Level {member.priority_level || '-'}
                    </p>
                  </div>
                </div>

                {/* Target Loads */}
                {(member.target_theory_load > 0 ||
                  member.target_lab_load > 0 ||
                  member.target_tutorial_load > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-800/50">
                    <p className="text-gray-500 text-xs mb-2">Target Loads:</p>
                    <div className="flex gap-2 flex-wrap text-xs">
                      {member.target_theory_load > 0 && (
                        <span className="px-2 py-1 bg-teal-600/20 text-teal-300 rounded">
                          Theory: {member.target_theory_load}
                        </span>
                      )}
                      {member.target_lab_load > 0 && (
                        <span className="px-2 py-1 bg-green-600/20 text-green-300 rounded">
                          Lab: {member.target_lab_load}
                        </span>
                      )}
                      {member.target_tutorial_load > 0 && (
                        <span className="px-2 py-1 bg-amber-600/20 text-amber-300 rounded">
                          Tutorial: {member.target_tutorial_load}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Indicator */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      member.is_active ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-xs text-gray-400">
                    {member.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Faculty Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="min-h-screen flex items-start justify-center pt-8 pb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-800/50 sticky top-0 z-10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Add New Faculty Member
              </h3>
              <button
                onClick={() => {
                  if (submitting) return;
                  setShowAddModal(false);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddFaculty} className="p-6 space-y-6">
              {/* Basic Information */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Basic Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Faculty Code <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <input
                        type="text"
                        required
                        value={formData.faculty_code}
                        onChange={(e) => setFormData({ ...formData, faculty_code: e.target.value.toUpperCase() })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 pl-10 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., CDK, NPS"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <input
                        type="text"
                        required
                        value={formData.faculty_name}
                        onChange={(e) => setFormData({ ...formData, faculty_name: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 pl-10 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Dr. John Smith"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 pl-10 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="john@vit.edu"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Phone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 pl-10 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Designation
                    </label>
                    <select
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="Professor">Professor</option>
                      <option value="Associate Professor">Associate Professor</option>
                      <option value="Assistant Professor">Assistant Professor</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Role
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="FACULTY">Faculty</option>
                      <option value="HOD">HOD</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Load Configuration */}
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Load Configuration
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Max Load/Week
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.max_load_per_week}
                      onChange={(e) => setFormData({ ...formData, max_load_per_week: parseInt(e.target.value) })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Priority Level
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={formData.priority_level}
                      onChange={(e) => setFormData({ ...formData, priority_level: parseInt(e.target.value) })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Theory Load
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.target_theory_load}
                      onChange={(e) => setFormData({ ...formData, target_theory_load: parseInt(e.target.value) })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Lab Load
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.target_lab_load}
                      onChange={(e) => setFormData({ ...formData, target_lab_load: parseInt(e.target.value) })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    if (submitting) return;
                    setShowAddModal(false);
                  }}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Adding...' : 'Add Faculty'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
