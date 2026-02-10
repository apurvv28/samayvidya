'use client';

import { useState, useEffect } from 'react';
import { Plus, BookOpen, Trash2, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../utils/supabase';

export default function Semester() {
  const [year, setYear] = useState('SY');
  const [subjects, setSubjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    subject_id: '',
    subject_name: '',
    subject_type: 'THEORY',
    credits: 3,
    hours_per_week: 3,
    requires_continuity: false,
    department_id: '',
    year: 'SY',
    theory_hours: 0,
    lab_hours: 0,
    tutorial_hours: 0
  });

  useEffect(() => {
    fetchData();
  }, [year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Subjects for selected year via Backend (Bypasses RLS)
      const response = await fetch(`http://localhost:8000/subjects?year=${year}`);
      const json = await response.json();
      
      if (!response.ok) {
          throw new Error(json.detail || 'Failed to fetch subjects');
      }
      setSubjects(json.data || []);

      // Fetch Departments for dropdown
      try {
        const deptResponse = await fetch('http://localhost:8000/departments');
        const deptJson = await deptResponse.json();
        if (deptResponse.ok) {
             setDepartments(deptJson.data || []);
        } else {
             console.error("Department fetch failed:", deptJson);
        }
      } catch (err) {
        console.error("Backend fetch error:", err);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this subject?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch(`http://localhost:8000/subjects/${id}`, {
          method: 'DELETE',
          headers: {
              'Authorization': `Bearer ${token}`
          }
      });

      if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Failed to delete');
      }
      
      setSubjects(subjects.filter(sub => sub.subject_id !== id));
    } catch (error) {
      console.error('Error deleting subject:', error);
      alert(`Failed to delete subject: ${error.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Prepare payload matches Backend Pydantic model
      const payload = {
          subject_id: formData.subject_id,
          subject_name: formData.subject_name,
          subject_type: formData.subject_type,
          credits: formData.credits,
          hours_per_week: formData.hours_per_week,
          theory_hours: formData.theory_hours,
          lab_hours: formData.lab_hours,
          tutorial_hours: formData.tutorial_hours,
          requires_continuity: formData.requires_continuity,
          department_id: formData.department_id,
          year: formData.year
      };
      
      // I must assume I need to fix the backend model as well.
      // For now, let's send the request.
      
      const response = await fetch('http://localhost:8000/subjects', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload) 
      });

      if (!response.ok) {
          const errorData = await response.json();
          // FastAPI can return 'detail' as string or array of objects (validation errors)
          const errorMessage = typeof errorData.detail === 'object' 
            ? JSON.stringify(errorData.detail, null, 2) 
            : (errorData.detail || 'Failed to add subject');
          throw new Error(errorMessage);
      }

      // We manually update local state or re-fetch. Re-fetching is safer.
      alert('Subject added successfully!');
      setIsModalOpen(false);
      resetForm();
      fetchData(); // Refresh list
    } catch (error) {
      console.error('Error adding subject:', error);
      alert(`Failed to add subject: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      subject_id: '',
      subject_name: '',
      subject_type: 'THEORY',
      credits: 3,
      hours_per_week: 3,
      requires_continuity: false,
      department_id: departments.length > 0 ? departments[0].department_id : '',
      year: year,
      theory_hours: 0,
      lab_hours: 0,
      tutorial_hours: 0
    });
  };

  const openModal = () => {
     // Pre-select first dept if available
     setFormData(prev => ({
         ...prev, 
         department_id: prev.department_id || (departments.length > 0 ? departments[0].department_id : ''),
         year: year 
     }));
     setIsModalOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-indigo-400" />
                Semester Management
            </h2>
            <p className="text-gray-400 text-sm mt-1">Manage subjects and curriculum for each year.</p>
        </div>

        <div className="flex items-center gap-3">
             <select 
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5"
            >
                <option value="SY">Second Year (SY)</option>
                <option value="TY">Third Year (TY)</option>
                <option value="BTech">B.Tech</option>
            </select>
            
            <button 
                onClick={openModal}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
            >
                <Plus className="w-4 h-4" />
                Add Subject
            </button>
        </div>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden min-h-[400px]">
        {loading ? (
            <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        ) : (
            <table className="w-full text-left">
                <thead className="bg-gray-800 text-xs uppercase text-gray-400">
                    <tr>
                        <th className="px-6 py-4">Code</th>
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Credits</th>
                        <th className="px-6 py-4">Department</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {subjects.length > 0 ? (
                        subjects.map((sub) => (
                            <motion.tr 
                                key={sub.subject_id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                            >
                                <td className="px-6 py-4 font-mono text-indigo-300">{sub.subject_id}</td>
                                <td className="px-6 py-4 font-medium text-white">{sub.subject_name}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        sub.subject_type === 'LAB' ? 'bg-purple-500/10 text-purple-300' : 
                                        sub.subject_type === 'THEORY' ? 'bg-blue-500/10 text-blue-300' : 
                                        'bg-gray-700 text-gray-300'
                                    }`}>
                                        {sub.subject_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{sub.credits}</td>
                                <td className="px-6 py-4 text-gray-400">{sub.departments?.department_name || '-'}</td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => handleDelete(sub.subject_id)}
                                        className="text-red-400 hover:text-red-300 p-2 hover:bg-red-400/10 rounded-lg transition-colors"
                                        title="Delete Subject"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </motion.tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                No subjects found for {year}.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        )}
      </div>

      {/* Add Subject Modal */}
      <AnimatePresence>
        {isModalOpen && (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                >
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 sticky top-0 backdrop-blur-md z-10">
                        <h3 className="text-xl font-bold text-white">Add New Subject</h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase">Subject Name</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. Data Structures"
                                    value={formData.subject_name}
                                    onChange={e => setFormData({...formData, subject_name: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase">Subject Code (ID)</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 font-mono"
                                    placeholder="e.g. CS2001"
                                    value={formData.subject_id}
                                    onChange={e => setFormData({...formData, subject_id: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase">Type</label>
                                <select 
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500"
                                    value={formData.subject_type}
                                    onChange={e => setFormData({...formData, subject_type: e.target.value})}
                                >
                                    <option value="THEORY">Theory</option>
                                    <option value="LAB">Lab</option>
                                    <option value="TUTORIAL">Tutorial</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase">Credits</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500"
                                    value={formData.credits}
                                    onChange={e => setFormData({...formData, credits: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase">Hours / Week</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500"
                                    value={formData.hours_per_week}
                                    onChange={e => setFormData({...formData, hours_per_week: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-400 uppercase">Department</label>
                            <select 
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500"
                                value={formData.department_id}
                                onChange={e => setFormData({...formData, department_id: e.target.value})}
                                required
                            >
                                <option value="" disabled>Select Department</option>
                                {departments.map(dept => (
                                    <option key={dept.department_id} value={dept.department_id}>
                                        {dept.department_name}
                                    </option>
                                ))}
                            </select>
                            {departments.length === 0 && <p className="text-xs text-red-400">No departments found. Please add departments first.</p>}
                        </div>

                        {/* Breakdown Hours */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
                             <div className="space-y-1">
                                <label className="text-xs text-gray-400">Theory Hours</label>
                                <input 
                                    type="number" min="0"
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                                    value={formData.theory_hours}
                                    onChange={e => setFormData({...formData, theory_hours: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">Lab Hours</label>
                                <input 
                                    type="number" min="0"
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                                    value={formData.lab_hours}
                                    onChange={e => setFormData({...formData, lab_hours: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">Tutorial Hours</label>
                                <input 
                                    type="number" min="0"
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                                    value={formData.tutorial_hours}
                                    onChange={e => setFormData({...formData, tutorial_hours: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                id="continuity"
                                className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                checked={formData.requires_continuity}
                                onChange={e => setFormData({...formData, requires_continuity: e.target.checked})}
                            />
                            <label htmlFor="continuity" className="text-sm text-gray-300">Requires Continuity (Block periods)</label>
                        </div>

                        <div className="pt-4 flex gap-4">
                            <button 
                                type="button" 
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={submitting}
                                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                            >
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Save Subject
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
