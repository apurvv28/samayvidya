'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, Monitor, GraduationCap, X, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = 'http://localhost:8000';

export default function ManageResources() {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resourceType, setResourceType] = useState('CLASSROOM'); // CLASSROOM or LAB

  const [newRoom, setNewRoom] = useState({
      room_number: '',
      capacity: 60,
      department_id: '',
      room_type: 'CLASSROOM' 
  });

  useEffect(() => {
      fetchData();
  }, []);

  const fetchData = async () => {
      try {
          setLoading(true);

          const [roomsRes, deptsRes] = await Promise.all([
              fetch(`${API_BASE_URL}/rooms`),
              fetch(`${API_BASE_URL}/departments`)
          ]);

          if (roomsRes.ok) {
              const data = await roomsRes.json();
              setRooms(data.data || []);
          } else {
              console.error("Failed to fetch rooms");
          }

          if (deptsRes.ok) {
              const data = await deptsRes.json();
              setDepartments(data.data || []);
              // Set default department
              if (data.data?.length > 0) {
                  setNewRoom(prev => ({ ...prev, department_id: data.data[0].department_id }));
              }
          } else {
              console.error("Failed to fetch departments");
          }

      } catch (error) {
          console.error("Error fetching data:", error);
          showToast("Failed to load resources", "error");
      } finally {
          setLoading(false);
      }
  };

  const handleAddResource = async (e) => {
      e.preventDefault();
      if (!newRoom.room_number || !newRoom.department_id) {
          showToast("Please fill all required fields", "error");
          return;
      }

      try {
          setSubmitting(true);

          const payload = {
              ...newRoom,
              room_type: resourceType // Ensure type matches the modal context
          };

          const response = await fetch(`${API_BASE_URL}/rooms`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
          });

          const data = await response.json();

          if (!response.ok) {
              throw new Error(data.detail || "Failed to add resource");
          }

          showToast(`${resourceType === 'CLASSROOM' ? 'Classroom' : 'Lab'} added successfully`, "success");
          setShowAddModal(false);
          setNewRoom(prev => ({ ...prev, room_number: '', capacity: 60 }));
          fetchData(); // Refresh list

      } catch (error) {
          console.error("Error adding resource:", error);
          showToast(error.message, "error");
      } finally {
          setSubmitting(false);
      }
  };

  const handleDeleteResource = async (roomId) => {
      if (!confirm("Are you sure you want to delete this resource?")) return;

      try {
          const response = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
              method: 'DELETE'
          });

          if (!response.ok) {
              const data = await response.json();
              throw new Error(data.detail || "Failed to delete resource");
          }

          showToast("Resource deleted successfully", "success");
          setRooms(rooms.filter(r => r.room_id !== roomId));

      } catch (error) {
          console.error("Error deleting resource:", error);
          showToast(error.message, "error");
      }
  };

  const openAddModal = (type) => {
      setResourceType(type);
      setNewRoom(prev => ({ ...prev, room_type: type, capacity: type === 'LAB' ? 30 : 60 }));
      setShowAddModal(true);
  };

  const classrooms = rooms.filter(r => r.room_type === 'CLASSROOM');
  const labs = rooms.filter(r => r.room_type === 'LAB');

  return (
    <div className="p-6 space-y-8">
       <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-6 h-6 text-indigo-400" />
                Resource Management
            </h2>
            <p className="text-gray-400 text-sm mt-1">Manage classrooms and laboratories available for scheduling.</p>
        </div>
      </div>

      {loading ? (
          <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Classrooms Panel */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-blue-400" />
                    Classrooms
                </h3>
                <button 
                    onClick={() => openAddModal('CLASSROOM')}
                    className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Add Classroom
                </button>
            </div>
            <div className="p-4">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                            <th className="pb-2">Name</th>
                            <th className="pb-2">Capacity</th>
                            <th className="pb-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {classrooms.length === 0 && (
                            <tr>
                                <td colSpan="3" className="py-4 text-center text-gray-500 italic">No classrooms added yet.</td>
                            </tr>
                        )}
                        {classrooms.map(cr => (
                            <tr key={cr.room_id} className="group">
                                <td className="py-3 text-gray-300 group-hover:text-white">{cr.room_number}</td>
                                <td className="py-3 text-gray-500">{cr.capacity}</td>
                                <td className="py-3 text-right">
                                    <button 
                                        onClick={() => handleDeleteResource(cr.room_id)}
                                        className="text-red-500/50 hover:text-red-400 transition-colors p-1"
                                        title="Delete Classroom"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Labs Panel */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm">
             <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-purple-400" />
                    Laboratories
                </h3>
                <button 
                    onClick={() => openAddModal('LAB')}
                    className="text-xs bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> Add Lab
                </button>
            </div>
            <div className="p-4">
                 <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                            <th className="pb-2">Name</th>
                            <th className="pb-2">Capacity</th>
                            <th className="pb-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {labs.length === 0 && (
                            <tr>
                                <td colSpan="3" className="py-4 text-center text-gray-500 italic">No laboratories added yet.</td>
                            </tr>
                        )}
                        {labs.map(lab => (
                            <tr key={lab.room_id} className="group">
                                <td className="py-3 text-gray-300 group-hover:text-white">{lab.room_number}</td>
                                <td className="py-3 text-gray-500">{lab.capacity}</td>
                                <td className="py-3 text-right">
                                    <button 
                                        onClick={() => handleDeleteResource(lab.room_id)}
                                        className="text-red-500/50 hover:text-red-400 transition-colors p-1"
                                        title="Delete Lab"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
      )}

      {/* Add Resource Modal */}
      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                  <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-800/50">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          {resourceType === 'CLASSROOM' ? <GraduationCap className="w-5 h-5 text-blue-400" /> : <Monitor className="w-5 h-5 text-purple-400" />}
                          Add New {resourceType === 'CLASSROOM' ? 'Classroom' : 'Laboratory'}
                      </h3>
                      <button 
                          onClick={() => setShowAddModal(false)}
                          className="text-gray-400 hover:text-white transition-colors"
                      >
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  
                  <form onSubmit={handleAddResource} className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">
                              {resourceType === 'CLASSROOM' ? 'Room Number' : 'Lab Name/Number'}
                          </label>
                          <input 
                              type="text" 
                              required
                              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                              placeholder={resourceType === 'CLASSROOM' ? 'e.g. CR-101' : 'e.g. LAB-1'}
                              value={newRoom.room_number}
                              onChange={(e) => setNewRoom({...newRoom, room_number: e.target.value})}
                          />
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Capacity</label>
                          <input 
                              type="number" 
                              required
                              min="1"
                              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                              value={newRoom.capacity}
                              onChange={(e) => setNewRoom({...newRoom, capacity: parseInt(e.target.value)})}
                          />
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Department</label>
                          <select 
                              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                              value={newRoom.department_id}
                              onChange={(e) => setNewRoom({...newRoom, department_id: e.target.value})}
                              required
                          >
                              {departments.map(d => (
                                  <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
                              ))}
                          </select>
                      </div>

                      <div className="pt-4 flex justify-end gap-3">
                          <button 
                              type="button"
                              onClick={() => setShowAddModal(false)}
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
                               Save {resourceType === 'CLASSROOM' ? 'Room' : 'Lab'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}
