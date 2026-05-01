'use client';

import { useState, useEffect } from 'react';
import { UserPlus, Mail, Phone, User, IdCard, Briefcase, Clock, Calendar, Target, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function AddFaculty() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingDepartment, setLoadingDepartment] = useState(true);
  const [validationErrors, setValidationErrors] = useState(null);
  const [formData, setFormData] = useState({
    faculty_code: '',
    faculty_name: '',
    email: '',
    phone: '',
    designation: 'Assistant Professor',
    role: 'FACULTY',
    priority_level: 3,
    preferred_start_time: '09:00',
    preferred_end_time: '17:00',
    min_working_days: 5,
    max_working_days: 6,
    max_load_per_week: 20,
    department_id: '',
    target_theory_load: 0,
    target_lab_load: 0,
    target_tutorial_load: 0,
    target_other_load: 0,
    is_active: true,
  });

  // Set department_id from user profile or fetch from API
  useEffect(() => {
    const fetchDepartmentId = async () => {
      setLoadingDepartment(true);
      
      // First try to get from profile
      if (profile?.department_id) {
        console.log('[ADD FACULTY] Department ID from profile:', profile.department_id);
        setFormData(prev => ({ ...prev, department_id: profile.department_id }));
        setLoadingDepartment(false);
        return;
      }

      // If not in profile, fetch from API
      try {
        const token = localStorage.getItem('authToken') || '';
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[ADD FACULTY] Fetched user data:', data);
          
          if (data.data?.department_id) {
            console.log('[ADD FACULTY] Department ID from API:', data.data.department_id);
            setFormData(prev => ({ ...prev, department_id: data.data.department_id }));
          } else {
            console.error('[ADD FACULTY] No department_id in API response');
            showToast('Unable to load department information. Please logout and login again.', 'error');
          }
        } else {
          console.error('[ADD FACULTY] Failed to fetch user data');
          showToast('Failed to load user information. Please logout and login again.', 'error');
        }
      } catch (error) {
        console.error('[ADD FACULTY] Error fetching department:', error);
        showToast('Error loading department information. Please try again.', 'error');
      } finally {
        setLoadingDepartment(false);
      }
    };

    fetchDepartmentId();
  }, [profile, showToast]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setValidationErrors(null);
    
    // Validation
    if (!formData.faculty_code || !formData.faculty_name || !formData.email) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (!formData.department_id) {
      showToast('Department information not found. Please login again.', 'error');
      console.error('[ADD FACULTY] Missing department_id. Profile:', profile);
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('authToken') || '';
      
      console.log('[ADD FACULTY] Submitting with department_id:', formData.department_id);
      
      // Convert string numbers to integers
      const payload = {
        ...formData,
        priority_level: parseInt(formData.priority_level),
        min_working_days: parseInt(formData.min_working_days),
        max_working_days: parseInt(formData.max_working_days),
        max_load_per_week: parseInt(formData.max_load_per_week),
        target_theory_load: parseInt(formData.target_theory_load),
        target_lab_load: parseInt(formData.target_lab_load),
        target_tutorial_load: parseInt(formData.target_tutorial_load),
        target_other_load: parseInt(formData.target_other_load),
      };

      console.log('[ADD FACULTY] Payload:', payload);

      const response = await fetch(`${API_BASE_URL}/faculty`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      console.log('[ADD FACULTY] Response status:', response.status);
      const data = await response.json();
      console.log('[ADD FACULTY] Response data:', data);

      if (!response.ok) {
        // Handle Pydantic validation errors
        if (data.detail && Array.isArray(data.detail)) {
          const errorMessages = data.detail.map(err => {
            const field = err.loc ? err.loc.join('.') : 'unknown';
            return `${field}: ${err.msg}`;
          }).join(', ');
          setValidationErrors(data.detail);
          throw new Error(errorMessages);
        }
        throw new Error(data.detail || 'Failed to add faculty');
      }

      showToast(data.message || `Faculty added: ${formData.faculty_name}`, 'success');
      
      // Reset form
      setFormData({
        faculty_code: '',
        faculty_name: '',
        email: '',
        phone: '',
        designation: 'Assistant Professor',
        role: 'FACULTY',
        priority_level: 3,
        preferred_start_time: '09:00',
        preferred_end_time: '17:00',
        min_working_days: 5,
        max_working_days: 6,
        max_load_per_week: 20,
        department_id: profile?.department_id || '',
        target_theory_load: 0,
        target_lab_load: 0,
        target_tutorial_load: 0,
        target_other_load: 0,
        is_active: true,
      });

    } catch (error) {
      console.error('Error adding faculty:', error);
      showToast(error.message || 'Failed to add faculty', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <div className="mx-auto w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
          <UserPlus className="w-6 h-6 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Add New Faculty</h2>
        <p className="text-gray-400 mt-2">Enter the details to register a new faculty member.</p>
        
        {/* Debug Info - Remove after testing */}
        {loadingDepartment ? (
          <div className="mt-3 text-xs text-teal-400 bg-teal-900/20 border border-teal-500/20 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading department information...
          </div>
        ) : formData.department_id ? (
          <div className="mt-3 text-xs text-green-400 bg-green-900/20 border border-green-500/20 rounded-lg px-3 py-2 inline-block">
            ✓ Department ID: {formData.department_id}
          </div>
        ) : (
          <div className="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded-lg px-3 py-2 inline-block">
            ⚠ No department ID found. Please logout and login again.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-gray-900/50 p-8 rounded-2xl border border-gray-800 backdrop-blur-sm">
        
        {/* Validation Errors Display */}
        {validationErrors && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
            <h4 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Validation Errors:
            </h4>
            <ul className="space-y-1 text-sm text-red-300">
              {validationErrors.map((err, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  <span>
                    <strong>{err.loc ? err.loc.join('.') : 'Field'}:</strong> {err.msg}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Hidden Department ID Field for debugging */}
        <input type="hidden" name="department_id" value={formData.department_id} />
        
        {/* Basic Information */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            Basic Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Faculty Code *</label>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input 
                  type="text" 
                  name="faculty_code"
                  required
                  value={formData.faculty_code}
                  onChange={handleChange}
                  className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="e.g., CDK, NPS, ABB"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input 
                  type="text" 
                  name="faculty_name"
                  required
                  value={formData.faculty_name}
                  onChange={handleChange}
                  className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Dr. John Smith"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input 
                  type="email" 
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="john.smith@vit.edu"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input 
                  type="tel" 
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Professional Information */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-400" />
            Professional Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Designation</label>
              <select 
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="Professor">Professor</option>
                <option value="Associate Professor">Associate Professor</option>
                <option value="Assistant Professor">Assistant Professor</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Role</label>
              <select 
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="FACULTY">Faculty</option>
                <option value="LAB_INCHARGE">Lab Incharge</option>
                <option value="COORDINATOR">Coordinator</option>
                <option value="HOD">HOD</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Priority Level</label>
              <input 
                type="number" 
                name="priority_level"
                min="1"
                max="10"
                value={formData.priority_level}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Max Load Per Week (hrs)</label>
              <input 
                type="number" 
                name="max_load_per_week"
                min="0"
                value={formData.max_load_per_week}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Schedule Preferences */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            Schedule Preferences
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Preferred Start Time</label>
              <input 
                type="time" 
                name="preferred_start_time"
                value={formData.preferred_start_time}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Preferred End Time</label>
              <input 
                type="time" 
                name="preferred_end_time"
                value={formData.preferred_end_time}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Min Working Days</label>
              <input 
                type="number" 
                name="min_working_days"
                min="1"
                max="7"
                value={formData.min_working_days}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Max Working Days</label>
              <input 
                type="number" 
                name="max_working_days"
                min="1"
                max="7"
                value={formData.max_working_days}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Target Loads */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            Target Loads (Optional)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Theory Load</label>
              <input 
                type="number" 
                name="target_theory_load"
                min="0"
                value={formData.target_theory_load}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Lab Load</label>
              <input 
                type="number" 
                name="target_lab_load"
                min="0"
                value={formData.target_lab_load}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Tutorial Load</label>
              <input 
                type="number" 
                name="target_tutorial_load"
                min="0"
                value={formData.target_tutorial_load}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Other Load</label>
              <input 
                type="number" 
                name="target_other_load"
                min="0"
                value={formData.target_other_load}
                onChange={handleChange}
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Adding Faculty...
            </>
          ) : (
            <>
              <UserPlus className="w-5 h-5" />
              Add Faculty Member
            </>
          )}
        </button>
      </form>
    </div>
  );
}
