'use client';

import { useState, useEffect } from 'react';
import { BackgroundBeams } from '../../components/ui/BackgroundBeams';
import DashboardNavbar from '../../components/Dashboard/DashboardNavbar';
import TimetableViewer from '../../components/Dashboard/TimetableViewer';
import RoleGuard from '../../components/RoleGuard';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Loader2, CheckCircle2, Building2, Users, Calendar as CalendarIcon } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('timetable');
  const [latestVersionId, setLatestVersionId] = useState(null);

  // Enrollment state
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [filteredDivisions, setFilteredDivisions] = useState([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollError, setEnrollError] = useState(null);

  const [enrollData, setEnrollData] = useState({
    department_id: '',
    year: '',
    division_id: '',
  });

  // Check if profile already has student assignment
  useEffect(() => {
    if (profile?.department_id && profile?.division) {
      setEnrolled(true);
      setEnrollData((prev) => ({
        ...prev,
        department_id: profile.department_id,
        division_id: profile.division,
      }));
      localStorage.setItem('studentEnrollment', JSON.stringify({
        department_id: profile.department_id,
        division_id: profile.division,
      }));
      return;
    }
    const savedEnrollment = localStorage.getItem('studentEnrollment');
    if (!savedEnrollment) return;
    try {
      const data = JSON.parse(savedEnrollment);
      setEnrolled(true);
      setEnrollData((prev) => ({ ...prev, ...data }));
    } catch {
      // ignore invalid local data
    }
  }, [profile]);

  // Fetch departments and divisions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingDeps(true);
        const [deptRes, divRes] = await Promise.all([
          fetch(`${API_BASE_URL}/auth/departments`),
          fetch(`${API_BASE_URL}/divisions`),
        ]);
        const deptData = await deptRes.json();
        const divData = await divRes.json();
        setDepartments(deptData.data || []);
        setDivisions(divData.data || []);
      } catch (err) {
        console.error('Failed to fetch enrollment data:', err);
      } finally {
        setLoadingDeps(false);
      }
    };
    fetchData();
  }, []);

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

  // Filter divisions when department or year changes
  useEffect(() => {
    let filtered = divisions;
    if (enrollData.department_id) {
      filtered = filtered.filter(d => d.department_id === enrollData.department_id);
    }
    if (enrollData.year) {
      filtered = filtered.filter(d => d.year === enrollData.year);
    }
    setFilteredDivisions(filtered);
  }, [enrollData.department_id, enrollData.year, divisions]);

  const handleEnrollChange = (e) => {
    const { name, value } = e.target;
    setEnrollData(prev => {
      const updated = { ...prev, [name]: value };
      // Reset division when department or year changes
      if (name === 'department_id' || name === 'year') {
        updated.division_id = '';
      }
      return updated;
    });
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setEnrollError(null);

    if (!enrollData.department_id || !enrollData.year || !enrollData.division_id) {
      setEnrollError('Please fill in all fields');
      return;
    }

    setEnrolling(true);

    try {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch(`${API_BASE_URL}/auth/me/enrollment`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          department_id: enrollData.department_id,
          division: enrollData.division_id,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.detail || 'Failed to save enrollment');
      }

      localStorage.setItem('studentEnrollment', JSON.stringify(enrollData));
      setEnrolled(true);
    } catch (err) {
      setEnrollError(err.message || 'Failed to enroll');
    } finally {
      setEnrolling(false);
    }
  };

  const handleUnenroll = () => {
    localStorage.removeItem('studentEnrollment');
    setEnrolled(false);
    setEnrollData({ department_id: '', year: '', division_id: '' });
  };

  // Get unique years from divisions
  const uniqueYears = [...new Set(divisions.map(d => d.year).filter(Boolean))].sort();

  // Get enrolled division name
  const enrolledDivision = divisions.find(d => d.division_id === enrollData.division_id);
  const enrolledDept = departments.find(d => d.department_id === enrollData.department_id);

  return (
    <RoleGuard allowedRole="STUDENT">
      <div className="min-h-screen bg-gray-950 text-white selection:bg-indigo-500/30">
        <DashboardNavbar role="student" activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 min-h-screen overflow-hidden">
          <BackgroundBeams className="opacity-20" />
          
          <div className="relative z-10 w-full max-w-7xl mx-auto">
            {/* Enrollment Banner */}
            {!enrolled ? (
            <div className="mb-8 bg-gradient-to-br from-indigo-900/40 to-purple-900/30 border border-indigo-500/20 rounded-2xl p-8 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                  <GraduationCap className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Student Enrollment</h2>
                  <p className="text-gray-400 text-sm">Select your department, year, and division to view your timetable</p>
                </div>
              </div>

              {enrollError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {enrollError}
                </div>
              )}

              {loadingDeps ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading enrollment options...
                </div>
              ) : (
                <form onSubmit={handleEnroll} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> Department
                    </label>
                    <select
                      name="department_id"
                      value={enrollData.department_id}
                      onChange={handleEnrollChange}
                      required
                      className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept.department_id} value={dept.department_id}>
                          {dept.department_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5" /> Year
                    </label>
                    <select
                      name="year"
                      value={enrollData.year}
                      onChange={handleEnrollChange}
                      required
                      className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select Year</option>
                      {uniqueYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Division
                    </label>
                    <select
                      name="division_id"
                      value={enrollData.division_id}
                      onChange={handleEnrollChange}
                      required
                      disabled={!enrollData.department_id || !enrollData.year}
                      className="w-full bg-gray-950/60 border border-gray-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select Division</option>
                      {filteredDivisions.map(div => (
                        <option key={div.division_id} value={div.division_id}>
                          {div.division_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 flex justify-end mt-2">
                    <button
                      type="submit"
                      disabled={enrolling}
                      className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2 disabled:opacity-60"
                    >
                      {enrolling ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <GraduationCap className="w-5 h-5" />
                          Enroll & View Timetable
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Enrolled info bar */
            <div className="mb-6 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border border-green-500/20 rounded-xl px-6 py-4 flex items-center justify-between backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-green-300">
                    Enrolled in {enrolledDivision?.division_name || 'Division'} 
                    {enrolledDept ? ` — ${enrolledDept.department_name}` : ''} 
                    {enrollData.year ? ` — ${enrollData.year}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleUnenroll}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
              >
                Change
              </button>
            </div>
          )}

          {/* Timetable Viewer — only shown when enrolled */}
          {enrolled ? (
            <div className="bg-gray-900/50 border border-white/5 rounded-2xl min-h-[60vh] backdrop-blur-sm">
              <TimetableViewer
                versionId={latestVersionId}
                onVersionChange={(newId) => setLatestVersionId(newId)}
                forcedDivisionId={enrollData.division_id || null}
              />
            </div>
          ) : (
            <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-12 text-center backdrop-blur-sm">
              <CalendarIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">Timetable will appear here</h3>
              <p className="text-gray-500">Please complete enrollment above to view your timetable</p>
            </div>
          )}
        </div>
      </main>
    </div>
    </RoleGuard>
  );
}
