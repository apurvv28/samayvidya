'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function authHeaders() {
  const token = localStorage.getItem('authToken') || '';
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export default function DraftHistoryModal({ isOpen, onClose }) {
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDrafts();
    }
  }, [isOpen]);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      // Let's assume timetable_versions route accepts filtering, or we get all and filter locally for drafts
      const response = await fetch(`${API_BASE_URL}/timetable-versions`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const inactiveDrafts = (data.data || []).filter(v => !v.is_active);
        setDrafts(inactiveDrafts);
      }
    } catch (error) {
      console.error('Failed to fetch drafts:', error);
      showToast('Failed to load history', 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteDraft = async (id) => {
    try {
      // Assuming a DELETE endpoint exists: `/timetable-versions/{id}`
      const response = await fetch(`${API_BASE_URL}/timetable-versions/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (response.ok) {
        showToast('Draft deleted successfully', 'success');
        setDrafts(drafts.filter(d => d.version_id !== id));
      } else {
        throw new Error('Deletion failed');
      }
    } catch(err) {
      showToast('Failed to delete draft', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]"
        >
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-100 p-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Timetable History</h3>
              <p className="text-xs text-gray-500">Older versions are stored as drafts and automatically deleted after 7 days.</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-teal-500" />
                <p className="text-sm">Loading drafts...</p>
              </div>
            ) : drafts.length === 0 ? (
               <div className="text-center py-10">
                 <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                 <p className="text-sm font-medium text-gray-600">No Drafts Found</p>
                 <p className="text-xs text-gray-400 mt-1">Older timetables will appear here.</p>
               </div>
            ) : (
               drafts.map(draft => (
                 <div key={draft.version_id} className="relative bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-300 transition-colors shadow-sm">
                   <div className="flex justify-between items-start">
                     <div>
                       <h4 className="text-sm font-bold text-gray-900">{draft.reason || 'Draft Version'}</h4>
                       <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 font-medium">
                         <span className="flex items-center gap-1">
                           <Calendar className="w-3.5 h-3.5" />
                           {new Date(draft.created_at).toLocaleDateString()}
                         </span>
                         <span className="flex items-center gap-1">
                           <Clock className="w-3.5 h-3.5" />
                           {new Date(draft.created_at).toLocaleTimeString()}
                         </span>
                       </div>
                     </div>
                     <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                       Draft
                     </span>
                   </div>
                 </div>
               ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
