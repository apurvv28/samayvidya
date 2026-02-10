'use client';

import { useState } from 'react';
import { Building2, Plus, Monitor, GraduationCap } from 'lucide-react';

export default function ManageResources() {
  const [classrooms, setClassrooms] = useState([
    { id: 1, name: 'CR-101', capacity: 60, type: 'Classroom' },
    { id: 2, name: 'CR-102', capacity: 60, type: 'Classroom' },
  ]);
  
  const [labs, setLabs] = useState([
    { id: 1, name: 'LAB-1', capacity: 40, type: 'Lab' },
  ]);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Classrooms Panel */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
                <h3 className="font-semibold text-white flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-blue-400" />
                    Classrooms
                </h3>
                <button className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Classroom
                </button>
            </div>
            <div className="p-4">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                            <th className="pb-2">Name</th>
                            <th className="pb-2">Capacity</th>
                            <th className="pb-2 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {classrooms.map(cr => (
                            <tr key={cr.id} className="group">
                                <td className="py-3 text-gray-300 group-hover:text-white">{cr.name}</td>
                                <td className="py-3 text-gray-500">{cr.capacity}</td>
                                <td className="py-3 text-right">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400">
                                        Active
                                    </span>
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
                <button className="text-xs bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Lab
                </button>
            </div>
            <div className="p-4">
                 <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                            <th className="pb-2">Name</th>
                            <th className="pb-2">Capacity</th>
                            <th className="pb-2 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {labs.map(lab => (
                            <tr key={lab.id} className="group">
                                <td className="py-3 text-gray-300 group-hover:text-white">{lab.name}</td>
                                <td className="py-3 text-gray-500">{lab.capacity}</td>
                                <td className="py-3 text-right">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400">
                                        Active
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
}
