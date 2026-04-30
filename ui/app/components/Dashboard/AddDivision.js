'use client';

import { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, PlusCircle, Eye, Users as UsersIcon } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import DivisionStudents from './DivisionStudents';

const API_BASE_URL = 'http://localhost:8000';

export default function AddDivision() {
  const { showToast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loadingDivisions, setLoadingDivisions] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [divisionData, setDivisionData] = useState({
    division_name: '',
    year: '2024-2025',
    department_id: '',
    // Defaults
    student_count: 60,
    min_working_days: 5,
    max_working_days: 6,
    earliest_start_time: "09:00",
    latest_end_time: "17:00"
  });

  useEffect(() => {
    fetchDepartments();
    fetchDivisions();
  }, []);

  const fetchDepartments = async () => {
    try {
                const response = await fetch(`${API_BASE_URL}/departments`);
        if (response.ok) {
            const data = await response.json();
            setDepartments(data.data || []);
        }
    } catch (error) {
        console.error("Failed to fetch departments:", error);
    }
  };

  const fetchDivisions = async () => {
    try {
      setLoadingDivisions(true);
      const token = localStorage.getItem('authToken') || '';
      const response = await fetch(`${API_BASE_URL}/divisions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDivisions(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch divisions:", error);
    } finally {
      setLoadingDivisions(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!divisionData.division_name) {
        showToast('Division Name is required', 'error');
        return;
    }
    if (!divisionData.department_id) {
         showToast("Please select a Department", 'error'); 
         return; 
    }

    try {
        setLoading(true);
        const token = localStorage.getItem('authToken') || '';

        // 1. Create Division
        const divResponse = await fetch(`${API_BASE_URL}/divisions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(divisionData)
        });
        
        const divJson = await divResponse.json();
        if (!divResponse.ok) throw new Error(divJson.detail || 'Failed to create division');
        
        const divisionId = divJson.data[0].division_id;

        // 2. Upload CSV if selected
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            
            const uploadResponse = await fetch(`${API_BASE_URL}/divisions/${divisionId}/students/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData
            });
            
            const uploadJson = await uploadResponse.json();
            if (!uploadResponse.ok) throw new Error(uploadJson.detail || 'Failed to upload students');
            
            showToast(`Division created! ${uploadJson.message}`, 'success');
        } else {
             showToast('Division created successfully (no students uploaded).', 'success');
        }

        // Reset
        setFile(null);
        setDivisionData({ ...divisionData, division_name: '' });
        
        // Refresh divisions list
        await fetchDivisions();

    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Add Division Section */}
      <div className="max-w-3xl mx-auto">
       <div className="mb-8 text-center">
        <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <PlusCircle className="w-6 h-6 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Add New Division</h2>
        <p className="text-gray-400 mt-2">Create a new division and bulk upload student data.</p>
      </div>

      <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-800 backdrop-blur-sm space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Division Name</label>
                <input 
                    type="text" 
                    className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="e.g. SY-CSE-A"
                    value={divisionData.division_name}
                    onChange={(e) => setDivisionData({...divisionData, division_name: e.target.value})}
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Department</label>
                 <select 
                    className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={divisionData.department_id}
                    onChange={(e) => setDivisionData({...divisionData, department_id: e.target.value})}
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
                <label className="text-sm font-medium text-gray-300">Academic Year</label>
                <select 
                    className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    value={divisionData.year}
                    onChange={(e) => setDivisionData({...divisionData, year: e.target.value})}
                >
                    <option>2024-2025</option>
                    <option>2025-2026</option>
                    <option>2026-2027</option>
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Student Count</label>
                <input 
                    type="number" 
                    className="w-full bg-gray-950/50 border border-gray-700 rounded-lg py-2.5 px-4 text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="60"
                    value={divisionData.student_count}
                    onChange={(e) => setDivisionData({...divisionData, student_count: parseInt(e.target.value) || 0})}
                />
            </div>
        </div>

        <div className="space-y-4">
            <div className="flex justify-between items-center">
                 <label className="text-sm font-medium text-gray-300">Upload Student Data (CSV)</label>
                 <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">Auto-generates Student IDs</span>
            </div>
           
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-950/30'
                }`}
            >
                {file ? (
                    <div className="flex flex-col items-center">
                        <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
                        <p className="text-white font-medium">{file.name}</p>
                        <p className="text-gray-500 text-sm mt-1">Ready for upload</p>
                        <button 
                            onClick={() => setFile(null)}
                            className="mt-4 text-sm text-red-400 hover:text-red-300"
                        >
                            Remove file
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <Upload className="w-10 h-10 text-gray-500 mb-3" />
                        <p className="text-gray-300">Drag and drop your CSV file here</p>
                        <p className="text-gray-500 text-sm mt-1">or</p>
                        <label className="mt-3 cursor-pointer inline-flex items-center px-4 py-2 border border-gray-600 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors">
                            <span>Browse Files</span>
                            <input type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
                        </label>
                    </div>
                )}
            </div>
            
            <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-800/50 p-3 rounded-lg border border-gray-700/50">
                <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                <p>CSV should contain columns: Name/Student Name, Email, PRN/PRN Number. Student password will be set to PRN, and users will be linked to this selected division and department.</p>
            </div>
        </div>

        <button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-green-500/20 transition-all disabled:opacity-50"
        >
            {loading ? 'Processing...' : 'Create Division & Import Students'}
        </button>
      </div>
      </div>

      {/* View Divisions Section */}
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <UsersIcon className="w-7 h-7 text-indigo-400" />
            All Divisions
          </h2>
          <p className="text-gray-400 mt-1">View and manage existing divisions</p>
        </div>

        {loadingDivisions ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-400">Loading divisions...</div>
          </div>
        ) : divisions.length === 0 ? (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center backdrop-blur-sm">
            <UsersIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">No Divisions Found</h3>
            <p className="text-gray-500">Create your first division above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {divisions.map((division) => (
              <div
                key={division.division_id}
                className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 backdrop-blur-sm hover:border-indigo-500/30 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {division.division_name}
                    </h3>
                    <p className="text-sm text-gray-400">{division.year}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Students:</span>
                    <span className="text-white font-semibold">{division.student_count}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Working Days:</span>
                    <span className="text-white">{division.min_working_days}-{division.max_working_days}</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDivision(division)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg font-medium transition-colors border border-indigo-500/30"
                >
                  <Eye className="w-4 h-4" />
                  View Students
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Division Students Modal */}
      {selectedDivision && (
        <DivisionStudents
          divisionId={selectedDivision.division_id}
          divisionName={selectedDivision.division_name}
          onClose={() => setSelectedDivision(null)}
        />
      )}
    </div>
  );
}
