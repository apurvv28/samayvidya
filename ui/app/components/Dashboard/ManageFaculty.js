'use client';

import { useState, useEffect } from 'react';
import { Plus, Save, BookOpen, Users, Clock, Check, Upload, FileText, X, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = 'http://localhost:8000';

export default function ManageFaculty() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('list');
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddFacultyModal, setShowAddFacultyModal] = useState(false);
  const [showUploadFacultyModal, setShowUploadFacultyModal] = useState(false);
  const [facultyCsvFile, setFacultyCsvFile] = useState(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingLoad, setGeneratingLoad] = useState(false);

  // Faculty Form State
  const [newFaculty, setNewFaculty] = useState({
    faculty_name: '',
    faculty_code: '',
    email: '',
    phone: '',
    designation: 'Assistant Professor',
    department_id: '',
    role: 'FACULTY'
  });

  // Mapping Form State
  const [mapping, setMapping] = useState({
    faculty_id: '',
    subject_id: '',
    division_id: '',
    load_type: 'theory', // theory, lab, both, tutorial, theory_tutorial, all
  });

  // Load Distribution State
  const [selectedFacultyLoad, setSelectedFacultyLoad] = useState(null);
  const [loadDist, setLoadDist] = useState({
    target_theory_load: 0,
    target_lab_load: 0,
    target_tutorial_load: 0,
    target_other_load: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      // Parallel fetches
      const [facResponse, subResponse, divResponse, deptResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/faculty`, { headers }),
        fetch(`${API_BASE_URL}/subjects`, { headers }),
        fetch(`${API_BASE_URL}/divisions`, { headers }),
        fetch(`${API_BASE_URL}/departments`, { headers })
      ]);

      const [facData, subData, divData, deptData] = await Promise.all([
        facResponse.json(),
        subResponse.json(),
        divResponse.json(),
        deptResponse.json()
      ]);

      if (facResponse.ok) setFaculties(facData.data || []);
      else console.error("Faculty fetch failed", facData);

      if (subResponse.ok) setSubjects(subData.data || []);
      else console.error("Subject fetch failed", subData);
      
      if (divResponse.ok) setDivisions(divData.data || []);
      else console.error("Division fetch failed", divData);

      if (deptResponse.ok) {
          setDepartments(deptData.data || []);
          // Set default department if available
          if (deptData.data && deptData.data.length > 0) {
              setNewFaculty(prev => ({ ...prev, department_id: deptData.data[0].department_id }));
          }
      } else console.error("Department fetch failed", deptData);

    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to load data. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    if (!newFaculty.faculty_name || !newFaculty.faculty_code || !newFaculty.department_id) {
        alert('All fields are required');
        return;
    }

    try {
        setSubmitting(true);
        const token = await getAuthToken();
        
        // Determine Priority and Max Load based on Designation
        let priority_level = 3;
        let max_load_per_week = 20;

        if (newFaculty.designation === 'Professor') {
            priority_level = 1;
            max_load_per_week = 14;
        } else if (newFaculty.designation === 'Associate Professor') {
            priority_level = 2;
            max_load_per_week = 18;
        } else if (newFaculty.designation === 'Assistant Professor') {
            priority_level = 3;
            max_load_per_week = 20; // or 22
        } else {
            priority_level = 4;
            max_load_per_week = 22;
        }

        // Payload matching Backend Pydantic Schema
        const payload = {
            faculty_code: newFaculty.faculty_code,
            faculty_name: newFaculty.faculty_name,
            role: newFaculty.role,
            designation: newFaculty.designation,
            department_id: newFaculty.department_id,
            email: newFaculty.email,
            phone: newFaculty.phone,
            // Dynamic assignment based on designation
            priority_level: priority_level,
            max_load_per_week: max_load_per_week,
            // Defaults for required fields
            preferred_start_time: "09:00",
            preferred_end_time: "17:00",
            min_working_days: 5,
            max_working_days: 6,
            is_active: true
        };

        const response = await fetch(`${API_BASE_URL}/faculty`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const json = await response.json();
        
        if (!response.ok) {
            throw new Error(json.detail || 'Failed to add faculty');
        }

        alert('Faculty added successfully!');
        setFaculties([...faculties, json.data[0]]); // Assuming backend returns array or single obj in data?
        // Actually backend returns "data": object (from .single() or insert().execute())
        // supabase insert returns list by default.
        // Let's refetch to be safe or append if format is known.
        fetchData(); 
        
        setShowAddFacultyModal(false);
        setNewFaculty(prev => ({ 
            ...prev, 
            faculty_name: '', 
            faculty_code: '', 
            email: '', 
            phone: '' 
        }));
    } catch (error) {
        console.error('Error adding faculty:', error);
        alert('Failed to add faculty: ' + error.message);
    } finally {
        setSubmitting(false);
    }
  };

  const handleFacultyCsvFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFacultyCsvFile(e.target.files[0]);
      setUploadSummary(null);
    }
  };

  const handleFacultyCsvUpload = async () => {
    if (!facultyCsvFile) {
      showToast('Please select a CSV or XLSX file to upload.', 'error');
      return;
    }

    try {
      setUploadingCsv(true);
      const token = await getAuthToken();

      if (!token) {
        showToast('Authentication failed. Please log in again.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', facultyCsvFile);

      const response = await fetch(`${API_BASE_URL}/faculty/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.detail || 'Failed to upload faculty file');
      }

      setUploadSummary(json.data || null);
      setFacultyCsvFile(null);
      showToast(json.message || 'Faculty CSV processed successfully.', 'success');
      fetchData();
    } catch (error) {
      console.error('Error uploading faculty file:', error);
      showToast('Failed to upload file: ' + error.message, 'error');
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleGenerateAILoad = async () => {
    try {
        setGeneratingLoad(true);
        const token = await getAuthToken();
        if (!token) {
            showToast('Authentication failed. Please log in again.', 'error');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/agents/generate-faculty-load`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const json = await response.json();
        
        if (!response.ok) {
            throw new Error(json.detail || 'Failed to generate load');
        }

        showToast('AI Load distributed successfully!', 'success');
        fetchData(); // Refresh the data to show updated loads
    } catch (error) {
        console.error('Error generating AI load:', error);
        showToast('Failed to generate load: ' + error.message, 'error');
    } finally {
        setGeneratingLoad(false);
    }
  };

  const handleMappingSubmit = async (e) => {
    e.preventDefault();
    if (!mapping.faculty_id || !mapping.subject_id || !mapping.division_id) {
        showToast('Please select Faculty, Subject, and Division', 'error');
        return;
    }

    try {
        setSubmitting(true);
        const token = await getAuthToken();

        if (!token) {
            showToast('Authentication failed. Please log in again.', 'error');
            setSubmitting(false);
            return;
        }

        // Determine session types to add based on load_type selection
        let sessionTypes = [];
        if (mapping.load_type === 'theory') sessionTypes = ['THEORY'];
        else if (mapping.load_type === 'lab') sessionTypes = ['LAB'];
        else if (mapping.load_type === 'tutorial') sessionTypes = ['TUTORIAL'];
        else if (mapping.load_type === 'both') sessionTypes = ['THEORY', 'LAB'];
        else if (mapping.load_type === 'theory_tutorial') sessionTypes = ['THEORY', 'TUTORIAL'];
        else if (mapping.load_type === 'all') sessionTypes = ['THEORY', 'LAB', 'TUTORIAL'];

        // Submit one request per session type
        for (const type of sessionTypes) {
            const payload = {
                subject_id: mapping.subject_id,
                division_id: mapping.division_id,
                batch_id: null, // Default to null for now, can be updated later if batch selection is added
                session_type: type
            };

            const response = await fetch(`${API_BASE_URL}/faculty/${mapping.faculty_id}/subjects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const json = await response.json();

            if (!response.ok) {
                console.error("Mapping failed for", type, json);
                throw new Error(json.detail || `Failed to map ${type}`);
            }
        }

        showToast('Course mapped successfully!', 'success');
        // Ideally clear form or fetch data again
    } catch (error) {
        console.error('Error mapping course:', error);
        showToast('Failed to map course: ' + error.message, 'error');
    } finally {
        setSubmitting(false);
    }
  };

  const handleLoadUpdate = async (e) => {
    e.preventDefault();
    if (!selectedFacultyLoad) return;

    try {
        setSubmitting(true);
        const token = await getAuthToken();

        if (!token) {
            showToast('Authentication failed. Please log in again.', 'error');
            setSubmitting(false);
            return;
        }

        const payload = {
            target_theory_load: parseInt(loadDist.target_theory_load),
            target_lab_load: parseInt(loadDist.target_lab_load),
            target_tutorial_load: parseInt(loadDist.target_tutorial_load),
            target_other_load: parseInt(loadDist.target_other_load),
        };

        const response = await fetch(`${API_BASE_URL}/faculty/${selectedFacultyLoad}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const json = await response.json();

        if (!response.ok) {
            throw new Error(json.detail || 'Failed to update load');
        }
        
        // Update local state
        setFaculties(faculties.map(f => 
             f.faculty_id === selectedFacultyLoad 
                ? { ...f, ...loadDist }
                : f
        ));
        
        alert('Load distribution updated!');
    } catch (error) {
        console.error('Error updating load:', error);
        alert('Failed to update load: ' + error.message);
    } finally {
        setSubmitting(false);
    }
  };

  const onSelectFacultyForLoad = (facultyId) => {
    const faculty = faculties.find(f => f.faculty_id === facultyId);
    if (faculty) {
        setSelectedFacultyLoad(facultyId);
        setLoadDist({
            target_theory_load: faculty.target_theory_load || 0,
            target_lab_load: faculty.target_lab_load || 0,
            target_tutorial_load: faculty.target_tutorial_load || 0,
            target_other_load: faculty.target_other_load || 0,
        });
    }
  };

  return (
    <div className="space-y-8 p-6">
      
      {/* Header & Add Button */}
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-white">Manage Faculty</h2>
            <p className="text-gray-400">Add faculty, map courses, and distribute load.</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={handleGenerateAILoad}
                disabled={generatingLoad}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
            >
                {generatingLoad ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                {generatingLoad ? 'Mapping AI...' : 'Generate AI Load'}
            </button>
            <button
                onClick={() => {
                    setShowUploadFacultyModal(true);
                    setUploadSummary(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium transition-colors"
            >
                <Upload className="w-5 h-5" />
                Upload CSV
            </button>
            <button 
                onClick={() => setShowAddFacultyModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors"
            >
                <Plus className="w-5 h-5" />
                Add Faculty
            </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
             <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Container 1: Faculty Course Mapping */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                    <BookOpen className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">Faculty Course Mapping</h3>
            </div>

            <form onSubmit={handleMappingSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Select Faculty</label>
                    <div className="relative">
                        <select 
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none appearance-none"
                            value={mapping.faculty_id}
                            onChange={(e) => setMapping({...mapping, faculty_id: e.target.value})}
                            required
                        >
                            <option value="">Choose Faculty...</option>
                            {faculties.map(f => (
                                <option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name} ({f.faculty_code})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Select Course</label>
                     <div className="relative">
                        <select 
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none appearance-none"
                            value={mapping.subject_id}
                            onChange={(e) => setMapping({...mapping, subject_id: e.target.value})}
                            required
                        >
                            <option value="">Choose Course...</option>
                            {subjects.map(s => (
                                <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.subject_id})</option>
                            ))}
                        </select>
                         <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Select Division</label>
                     <div className="relative">
                        <select 
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none appearance-none"
                            value={mapping.division_id}
                            onChange={(e) => setMapping({...mapping, division_id: e.target.value})}
                            required
                        >
                            <option value="">Choose Division...</option>
                            {divisions.map(d => (
                                <option key={d.division_id} value={d.division_id}>{d.division_name}</option>
                            ))}
                        </select>
                         <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Load Type</label>
                    <div className="grid grid-cols-2 gap-3">
                        {['theory', 'lab', 'tutorial', 'both', 'theory_tutorial', 'all'].map((type) => (
                            <label key={type} className={`
                                flex items-center justify-center px-4 py-2 rounded-lg border cursor-pointer transition-all
                                ${mapping.load_type === type 
                                    ? 'bg-purple-600/20 border-purple-500 text-purple-300' 
                                    : 'bg-gray-950/50 border-gray-800 text-gray-400 hover:border-gray-700'}
                            `}>
                                <input 
                                    type="radio" 
                                    name="load_type" 
                                    value={type}
                                    checked={mapping.load_type === type}
                                    onChange={(e) => setMapping({...mapping, load_type: e.target.value})}
                                    className="hidden"
                                />
                                <span className="capitalize text-xs sm:text-sm">{type.replace('_', ' + ').replace('both', 'Theory + Lab').replace('all', 'All 3')}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <button 
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-4"
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Map Course
                </button>
            </form>
        </div>

        {/* Container 2: Faculty Weekly Load Distribution */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Clock className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">Weekly Load Distribution</h3>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Select Faculty to Edit</label>
                     <div className="relative">
                        <select 
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 outline-none appearance-none"
                            value={selectedFacultyLoad || ''}
                            onChange={(e) => onSelectFacultyForLoad(e.target.value)}
                        >
                            <option value="">Choose Faculty...</option>
                            {faculties.map(f => (
                                <option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name} ({f.faculty_code})</option>
                            ))}
                        </select>
                         <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                {selectedFacultyLoad && (
                    <form onSubmit={handleLoadUpdate} className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Theory (Hrs)</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                                    value={loadDist.target_theory_load}
                                    onChange={(e) => setLoadDist({...loadDist, target_theory_load: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Lab (Hrs)</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                                    value={loadDist.target_lab_load}
                                    onChange={(e) => setLoadDist({...loadDist, target_lab_load: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Tutorial (Hrs)</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                                    value={loadDist.target_tutorial_load}
                                    onChange={(e) => setLoadDist({...loadDist, target_tutorial_load: e.target.value})}
                                />
                            </div>
                             <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Other (Hrs)</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                                    value={loadDist.target_other_load}
                                    onChange={(e) => setLoadDist({...loadDist, target_other_load: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                             <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-sm text-blue-300 flex justify-between items-center">
                                <span>Total Load:</span>
                                <span className="font-bold text-lg">
                                    {(parseInt(loadDist.target_theory_load) || 0) + 
                                     (parseInt(loadDist.target_lab_load) || 0) + 
                                     (parseInt(loadDist.target_tutorial_load) || 0) + 
                                     (parseInt(loadDist.target_other_load) || 0)} Hrs
                                </span>
                             </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={submitting}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Update Load Distribution
                        </button>
                    </form>
                )}

                {!selectedFacultyLoad && (
                    <div className="text-center py-8 text-gray-500 bg-gray-950/30 rounded-lg border border-dashed border-gray-800">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Select a faculty member to distribute load</p>
                    </div>
                )}
            </div>
        </div>

      </div>
      )}

      {/* Upload Faculty CSV Modal */}
      {showUploadFacultyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-800/50">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Upload className="w-5 h-5 text-emerald-400" />
                        Bulk Upload Faculty
                    </h3>
                    <button 
                        onClick={() => {
                            if (uploadingCsv) return;
                            setShowUploadFacultyModal(false);
                            setFacultyCsvFile(null);
                        }}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Faculty File (CSV/XLSX)</label>
                        <input
                            type="file"
                            accept=".csv,.xlsx"
                            onChange={handleFacultyCsvFileChange}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500"
                        />
                        {facultyCsvFile && (
                            <p className="text-sm text-emerald-300 mt-2">
                                Selected file: {facultyCsvFile.name}
                            </p>
                        )}
                    </div>

                    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 space-y-2">
                        <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                            <p>
                                CSV required columns: <span className="text-white">Faculty Code, Faculty Name, Email</span>, and
                                either <span className="text-white">Department ID</span> or <span className="text-white">Department Name</span>.
                            </p>
                        </div>
                        <p className="text-gray-400">
                            XLSX is also supported. For EDI load-sheet style files, the importer auto-picks the faculty sheet
                            and auto-fills missing code/email/role fields before import.
                        </p>
                    </div>

                    {uploadSummary && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 space-y-3">
                            <p className="text-sm text-emerald-300">
                                Processed: {uploadSummary.total_rows || 0} | Created: {uploadSummary.created || 0} | Failed: {uploadSummary.failed || 0}
                            </p>
                            {uploadSummary.errors && uploadSummary.errors.length > 0 && (
                                <div className="max-h-32 overflow-y-auto rounded-md bg-gray-950 border border-gray-800 p-2">
                                    {uploadSummary.errors.slice(0, 10).map((error, index) => (
                                        <p key={`${error}-${index}`} className="text-xs text-red-300 py-0.5">{error}</p>
                                    ))}
                                    {uploadSummary.errors.length > 10 && (
                                        <p className="text-xs text-gray-400 pt-1">
                                            +{uploadSummary.errors.length - 10} more errors
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-2 flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => {
                                if (uploadingCsv) return;
                                setShowUploadFacultyModal(false);
                                setFacultyCsvFile(null);
                            }}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="button"
                            disabled={uploadingCsv || !facultyCsvFile}
                            onClick={handleFacultyCsvUpload}
                            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                             {uploadingCsv && <Loader2 className="w-4 h-4 animate-spin" />}
                             {uploadingCsv ? 'Uploading...' : 'Upload & Import'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Add Faculty Modal */}
      {showAddFacultyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-800/50">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-400" />
                        Add New Faculty
                    </h3>
                    <button 
                        onClick={() => setShowAddFacultyModal(false)}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <form onSubmit={handleAddFaculty} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                        <input 
                            type="text" 
                            required
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            placeholder="Dr. John Doe"
                            value={newFaculty.faculty_name}
                            onChange={(e) => setNewFaculty({...newFaculty, faculty_name: e.target.value})}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Faculty Code/ID</label>
                            <input 
                                type="text" 
                                required
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                                placeholder="FAC001"
                                value={newFaculty.faculty_code}
                                onChange={(e) => setNewFaculty({...newFaculty, faculty_code: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Designation</label>
                             <div className="relative">
                                <select 
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                                    value={newFaculty.designation}
                                    onChange={(e) => setNewFaculty({...newFaculty, designation: e.target.value})}
                                >
                                    <option>Professor</option>
                                    <option>Associate Professor</option>
                                    <option>Assistant Professor</option>
                                    <option>Lecturer</option>
                                    <option>Visiting Faculty</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Department</label>
                         <div className="relative">
                            <select 
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                                value={newFaculty.department_id}
                                onChange={(e) => setNewFaculty({...newFaculty, department_id: e.target.value})}
                                required
                            >
                                <option value="" disabled>Select Department</option>
                                {departments.map(d => (
                                    <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-500 pointer-events-none" />
                         </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                            <input 
                                type="email" 
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                                placeholder="email@example.com"
                                value={newFaculty.email}
                                onChange={(e) => setNewFaculty({...newFaculty, email: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Phone</label>
                            <input 
                                type="tel" 
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                                placeholder="+91..."
                                value={newFaculty.phone}
                                onChange={(e) => setNewFaculty({...newFaculty, phone: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => setShowAddFacultyModal(false)}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={submitting}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                             {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                             Save Faculty
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
