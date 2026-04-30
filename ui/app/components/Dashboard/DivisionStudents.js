'use client';

import { useState, useEffect } from 'react';
import { Users, Loader2, Mail, IdCard, X, Hash } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = 'http://localhost:8000';

export default function DivisionStudents({ divisionId, divisionName, onClose }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (divisionId) {
      fetchStudents();
    }
  }, [divisionId]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_BASE_URL}/divisions/${divisionId}/students`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.detail || 'Failed to fetch students');
      }

      setStudents(json.data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      showToast('Failed to fetch students: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="min-h-screen flex items-start justify-center pt-8 pb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-800/50 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                <Users className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Students in {divisionName}</h3>
                <p className="text-sm text-gray-400">
                  {students.length} student{students.length !== 1 ? 's' : ''} enrolled
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-400 mb-2">No Students Found</h3>
                <p className="text-gray-500">No students have been uploaded to this division yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-300 font-medium">
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          Roll No
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 text-gray-300 font-medium">Student Name</th>
                      <th className="text-left px-4 py-3 text-gray-300 font-medium">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 text-gray-300 font-medium">
                        <div className="flex items-center gap-2">
                          <IdCard className="w-4 h-4" />
                          PRN
                        </div>
                      </th>
                      <th className="text-left px-4 py-3 text-gray-300 font-medium">Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {students.map((student) => (
                      <tr
                        key={student.prn_number}
                        className="hover:bg-gray-800/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-white font-mono">
                          {student.roll_number}
                        </td>
                        <td className="px-4 py-3 text-white">
                          {student.student_name}
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {student.email}
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono">
                          {student.prn_number}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-indigo-600/20 text-indigo-300 rounded text-xs font-medium">
                            {student.batches?.batch_code || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-800 bg-gray-800/30">
            <div className="flex justify-between items-center text-sm text-gray-400">
              <div>
                <span className="font-semibold text-white">{students.length}</span> students total
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
