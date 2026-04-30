'use client';

import { useState, useEffect } from 'react';
import { User, Clock, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PasswordReset from './PasswordReset';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function FacultyProfile() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [facultyData, setFacultyData] = useState(null);
  const [formData, setFormData] = useState({
    preferred_start_time: '09:00',
    preferred_end_time: '17:00',
  });

  useEffect(() => {
    fetchFacultyProfile();
  }, [profile]);

  const fetchFacultyProfile = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken') || '';
      
      // Get faculty list and find current user's faculty record
      const response = await fetch(`${API_BASE_URL}/faculty`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Find faculty by email
        const faculty = data.data?.find(f => f.email === profile?.email);
        
        if (faculty) {
          setFacultyData(faculty);
          setFormData({
            preferred_start_time: faculty.preferred_start_time || '09:00',
            preferred_end_time: faculty.preferred_end_time || '17:00',
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch faculty profile:', error);
      showToast('Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!facultyData?.faculty_id) {
      showToast('Faculty profile not found', 'error');
      return;
    }

    // Validate times
    if (formData.preferred_start_time >= formData.preferred_end_time) {
      showToast('End time must be after start time', 'error');
      return;
    }

    setSaving(true);

    try {
      const token = localStorage.getItem('authToken') || '';
      
      const response = await fetch(`${API_BASE_URL}/faculty/${facultyData.faculty_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferred_start_time: formData.preferred_start_time,
          preferred_end_time: formData.preferred_end_time,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to update profile');
      }

      showToast('Availability updated successfully!', 'success');
      await fetchFacultyProfile(); // Refresh data
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast(error.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!facultyData) {
    return (
      <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-12 text-center backdrop-blur-sm">
        <User className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-400 mb-2">
          Faculty Profile Not Found
        </h3>
        <p className="text-gray-500">
          Unable to load your faculty profile. Please contact your coordinator.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/20 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
            <User className="w-8 h-8 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-1">
              {facultyData.faculty_name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                {facultyData.faculty_code}
              </span>
              <span>{facultyData.designation || 'Faculty'}</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
                {facultyData.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Availability Settings */}
      <div className="bg-gray-900/50 border border-white/5 rounded-2xl p-8 backdrop-blur-sm">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-6 h-6 text-indigo-400" />
            <h3 className="text-xl font-bold text-white">Daily Availability</h3>
          </div>
          <p className="text-gray-400 text-sm">
            Set your preferred working hours. This will be used for timetable scheduling.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Preferred Start Time *
              </label>
              <input
                type="time"
                name="preferred_start_time"
                value={formData.preferred_start_time}
                onChange={handleChange}
                min="08:00"
                max="18:00"
                required
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="text-xs text-gray-500">
                Earliest time you're available (08:00 - 18:00)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Preferred End Time *
              </label>
              <input
                type="time"
                name="preferred_end_time"
                value={formData.preferred_end_time}
                onChange={handleChange}
                min="08:00"
                max="18:00"
                required
                className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <p className="text-xs text-gray-500">
                Latest time you're available (08:00 - 18:00)
              </p>
            </div>
          </div>

          {/* Current Settings Display */}
          <div className="bg-gray-950/50 border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Current Settings</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Max Load per Week:</span>
                <span className="ml-2 text-white font-medium">{facultyData.max_load_per_week} hours</span>
              </div>
              <div>
                <span className="text-gray-500">Working Days:</span>
                <span className="ml-2 text-white font-medium">
                  {facultyData.min_working_days} - {facultyData.max_working_days} days
                </span>
              </div>
              <div>
                <span className="text-gray-500">Priority Level:</span>
                <span className="ml-2 text-white font-medium">{facultyData.priority_level}</span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>
                <span className={`ml-2 font-medium ${facultyData.is_active ? 'text-green-400' : 'text-red-400'}`}>
                  {facultyData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Availability
              </>
            )}
          </button>
        </form>
      </div>

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex gap-3">
          <Clock className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200">
            <p className="font-semibold mb-1">About Availability Times</p>
            <p className="text-blue-300/80">
              Your preferred start and end times help the system schedule your classes within your available hours. 
              The timetable generator will respect these preferences when creating schedules.
            </p>
          </div>
        </div>
      </div>

      {/* Password Reset Section */}
      <div className="bg-gray-900/50 border border-white/5 rounded-2xl p-8 backdrop-blur-sm">
        <div className="mb-6">
          <h3 className="text-xl font-bold text-white mb-2">Password Management</h3>
          <p className="text-gray-400 text-sm">
            Change your password or reset it if you've forgotten it
          </p>
        </div>
        <PasswordReset userEmail={facultyData.email} />
      </div>
    </div>
  );
}
