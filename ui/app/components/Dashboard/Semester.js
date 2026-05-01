'use client';

import { useState, useEffect } from 'react';
import { Plus, BookOpen, Trash2, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    tutorial_hours: 0,
    delivery_mode: 'OFFLINE',
    is_theory_online: false,
    is_lab_online: false,
    is_tutorial_online: false
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
      const response = await fetch(`http://localhost:8000/subjects/${id}`, {
                    method: 'DELETE'
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
          year: formData.year,
          delivery_mode: formData.delivery_mode,
          is_theory_online: formData.delivery_mode === 'ONLINE' ? true : formData.is_theory_online,
          is_lab_online: formData.delivery_mode === 'ONLINE' ? true : formData.is_lab_online,
          is_tutorial_online: formData.delivery_mode === 'ONLINE' ? true : formData.is_tutorial_online
      };
      
      const response = await fetch('http://localhost:8000/subjects', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
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
      tutorial_hours: 0,
      delivery_mode: 'OFFLINE',
      is_theory_online: false,
      is_lab_online: false,
      is_tutorial_online: false
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
    <>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <select 
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="bg-white border-2 border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block p-2.5"
        >
          <option value="SY">Second Year (SY)</option>
          <option value="TY">Third Year (TY)</option>
          <option value="BTech">B.Tech</option>
        </select>
        
        <button 
          onClick={openModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add Subject
        </button>
      </div>

      {/* Subject Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border-2 border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Credits</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subjects.length > 0 ? (
                subjects.map((sub) => (
                  <motion.tr 
                    key={sub.subject_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono text-blue-600">{sub.subject_id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{sub.subject_name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs border ${
                        sub.subject_type === 'LAB' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                        sub.subject_type === 'THEORY' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {sub.subject_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">{sub.credits}</td>
                    <td className="px-6 py-4 text-gray-600">{sub.departments?.department_name || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(sub.subject_id)}
                        className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
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
        </div>
      )}

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
                    className="bg-white border-2 border-gray-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                >
                    <div className="p-6 border-b-2 border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0 z-10">
                        <h3 className="text-xl font-bold text-gray-900">Add New Subject</h3>
                        <button onClick={() => setIsModalOpen(false)} className="text-gray-600 hover:text-gray-900 transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-600 uppercase">Subject Name</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full bg-white border-2 border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="e.g. Data Structures"
                                    value={formData.subject_name}
                                    onChange={e => setFormData({...formData, subject_name: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-600 uppercase">Subject Code (ID)</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full bg-white border-2 border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                    placeholder="e.g. CS2001"
                                    value={formData.subject_id}
                                    onChange={e => setFormData({...formData, subject_id: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-600 uppercase">Type</label>
                                <select 
                                    className="w-full bg-white border-2 border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.subject_type}
                                    onChange={e => setFormData({...formData, subject_type: e.target.value})}
                                >
                                    <option value="THEORY">Theory</option>
                                    <option value="LAB">Lab</option>
                                    <option value="TUTORIAL">Tutorial</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-600 uppercase">Credits</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-white border-2 border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.credits}
                                    onChange={e => setFormData({...formData, credits: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-600 uppercase">Hours / Week</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-white border-2 border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={formData.hours_per_week}
                                    onChange={e => setFormData({...formData, hours_per_week: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-600 uppercase">Department</label>
                            <select 
                                className="w-full bg-white border-2 border-gray-300 rounded-lg p-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            {departments.length === 0 && <p className="text-xs text-red-600">No departments found. Please add departments first.</p>}
                        </div>

                        {/* Breakdown Hours */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border-2 border-gray-100">
                             <div className="space-y-1">
                                <label className="text-xs text-gray-600">Theory Hours</label>
                                <input 
                                    type="number" min="0"
                                    className="w-full bg-white border-2 border-gray-300 rounded p-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500"
                                    value={formData.theory_hours}
                                    onChange={e => setFormData({...formData, theory_hours: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-600">Lab Hours</label>
                                <input 
                                    type="number" min="0"
                                    className="w-full bg-white border-2 border-gray-300 rounded p-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500"
                                    value={formData.lab_hours}
                                    onChange={e => setFormData({...formData, lab_hours: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-600">Tutorial Hours</label>
                                <input 
                                    type="number" min="0"
                                    className="w-full bg-white border-2 border-gray-300 rounded p-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500"
                                    value={formData.tutorial_hours}
                                    onChange={e => setFormData({...formData, tutorial_hours: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                />
                            </div>
                        </div>

                        {/* Delivery Mode & Online Status */}
                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-100">
                            <label className="text-xs font-semibold text-gray-600 uppercase block">Delivery Mode</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="delivery_mode"
                                        value="OFFLINE"
                                        checked={formData.delivery_mode === 'OFFLINE'}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            delivery_mode: e.target.value,
                                            is_theory_online: false,
                                            is_lab_online: false,
                                            is_tutorial_online: false
                                        })}
                                        className="text-blue-600 focus:ring-blue-500 bg-white border-gray-300"
                                    />
                                    <span className="text-sm text-gray-700">Offline</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="delivery_mode"
                                        value="ONLINE"
                                        checked={formData.delivery_mode === 'ONLINE'}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            delivery_mode: e.target.value,
                                            is_theory_online: true,
                                            is_lab_online: true,
                                            is_tutorial_online: true
                                        })}
                                        className="text-blue-600 focus:ring-blue-500 bg-white border-gray-300"
                                    />
                                    <span className="text-sm text-gray-700">Online</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="delivery_mode"
                                        value="PARTIAL"
                                        checked={formData.delivery_mode === 'PARTIAL'}
                                        onChange={e => setFormData({...formData, delivery_mode: e.target.value})}
                                        className="text-blue-600 focus:ring-blue-500 bg-white border-gray-300"
                                    />
                                    <span className="text-sm text-gray-700">Partially Online</span>
                                </label>
                            </div>

                            {formData.delivery_mode === 'PARTIAL' && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="pt-2 grid grid-cols-3 gap-2"
                                >
                                    <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border-2 border-gray-200">
                                        <input 
                                            type="checkbox"
                                            checked={formData.is_theory_online}
                                            onChange={e => setFormData({...formData, is_theory_online: e.target.checked})}
                                            className="rounded bg-white border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-700">Theory Online</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border-2 border-gray-200">
                                        <input 
                                            type="checkbox"
                                            checked={formData.is_lab_online}
                                            onChange={e => setFormData({...formData, is_lab_online: e.target.checked})}
                                            className="rounded bg-white border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-700">Lab Online</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border-2 border-gray-200">
                                        <input 
                                            type="checkbox"
                                            checked={formData.is_tutorial_online}
                                            onChange={e => setFormData({...formData, is_tutorial_online: e.target.checked})}
                                            className="rounded bg-white border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-700">Tutorial Online</span>
                                    </label>
                                </motion.div>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                id="continuity"
                                className="w-4 h-4 rounded bg-white border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={formData.requires_continuity}
                                onChange={e => setFormData({...formData, requires_continuity: e.target.checked})}
                            />
                            <label htmlFor="continuity" className="text-sm text-gray-700">Requires Continuity (Block periods)</label>
                        </div>

                        <div className="pt-4 flex gap-4">
                            <button 
                                type="button" 
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={submitting}
                                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
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
    </>
  );
}
