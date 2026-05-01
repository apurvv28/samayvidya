'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, RefreshCw, Eye, X, FileDown, Pencil, Save, Check } from 'lucide-react';

import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const FALLBACK_DAYS = [
  { day_id: 1, day_name: 'Sunday', is_working_day: false },
  { day_id: 2, day_name: 'Monday', is_working_day: true },
  { day_id: 3, day_name: 'Tuesday', is_working_day: true },
  { day_id: 4, day_name: 'Wednesday', is_working_day: true },
  { day_id: 5, day_name: 'Thursday', is_working_day: true },
  { day_id: 6, day_name: 'Friday', is_working_day: true },
  { day_id: 7, day_name: 'Saturday', is_working_day: false },
];

const FALLBACK_SLOTS = [
  { slot_id: '08:00-09:00', start_time: '08:00', end_time: '09:00', slot_order: 1, is_break: false },
  { slot_id: '09:00-10:00', start_time: '09:00', end_time: '10:00', slot_order: 2, is_break: false },
  { slot_id: '10:00-11:00', start_time: '10:00', end_time: '11:00', slot_order: 3, is_break: false },
  { slot_id: '11:00-12:00', start_time: '11:00', end_time: '12:00', slot_order: 4, is_break: false },
  { slot_id: '12:00-13:00', start_time: '12:00', end_time: '13:00', slot_order: 5, is_break: false },
  { slot_id: '13:00-14:00', start_time: '13:00', end_time: '14:00', slot_order: 6, is_break: false },
  { slot_id: '14:00-15:00', start_time: '14:00', end_time: '15:00', slot_order: 7, is_break: false },
  { slot_id: '15:00-16:00', start_time: '15:00', end_time: '16:00', slot_order: 8, is_break: false },
  { slot_id: '16:00-17:00', start_time: '16:00', end_time: '17:00', slot_order: 9, is_break: false },
  { slot_id: '17:00-18:00', start_time: '17:00', end_time: '18:00', slot_order: 10, is_break: false },
];

function makeLookupMap(rows, idKey, nameKey) {
  const map = new Map();
  (rows || []).forEach((row) => {
    if (row?.[idKey]) {
      map.set(row[idKey], row?.[nameKey] || row[idKey]);
    }
  });
  return map;
}

function getDayLabel(day) {
  return day?.day_name || day?.name || `Day ${day?.day_id ?? ''}`;
}

function getSlotLabel(slot) {
  if (!slot) {
    return '';
  }
  return `${slot.start_time} : ${slot.end_time}`;
}

function getSlotKey(slot) {
  return slot?.slot_id || `${slot?.start_time || ''}-${slot?.end_time || ''}`;
}

/** Tailwind classes for session-type pill on light timetable cards */
function sessionTypeBadgeClass(sessionType) {
  const t = String(sessionType || 'THEORY').toUpperCase();
  if (t === 'LAB' || t === 'PRACTICAL') {
    return 'bg-teal-100 text-teal-900 border-teal-300/90';
  }
  if (t === 'TUTORIAL') {
    return 'bg-violet-100 text-violet-900 border-violet-300/90';
  }
  return 'bg-sky-100 text-sky-900 border-sky-300/90';
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function sortByCountThenName(a, b) {
  if ((b.count || 0) !== (a.count || 0)) {
    return (b.count || 0) - (a.count || 0);
  }
  return String(a.label || '').localeCompare(String(b.label || ''));
}

export default function TimetableViewer({ versionId, onVersionChange, canManageTimetable = false, forcedDivisionId = null, facultyFilterId = null, showOnlyFacultyView = false }) {
  const { showToast } = useToast();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [entries, setEntries] = useState([]);
  const [days, setDays] = useState([]);
  const [slots, setSlots] = useState([]);
  const [versionMeta, setVersionMeta] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [facultyRows, setFacultyRows] = useState([]);
  const [roomRows, setRoomRows] = useState([]);

  const [divisionNameMap, setDivisionNameMap] = useState(new Map());
  const [facultyNameMap, setFacultyNameMap] = useState(new Map());
  const [subjectNameMap, setSubjectNameMap] = useState(new Map());
  const [subjectShortMap, setSubjectShortMap] = useState(new Map());
  const [batchCodeMap, setBatchCodeMap] = useState(new Map());
  const [roomNameMap, setRoomNameMap] = useState(new Map());

  const [modalState, setModalState] = useState({ open: false, section: null, entityId: null });
  const [editMode, setEditMode] = useState(false);
  const [editedByEntryId, setEditedByEntryId] = useState({});
  const [metadataDraft, setMetadataDraft] = useState({
    version_name: '',
    academic_year: '',
    semester: '',
    wef_date: '',
    to_date: '',
  });
  const [approvingTimetable, setApprovingTimetable] = useState(false);
  const [rejectingTimetable, setRejectingTimetable] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendingTimetable, setExtendingTimetable] = useState(false);
  const [newToDate, setNewToDate] = useState('');

  const canEditTimetable = canManageTimetable && ['COORDINATOR', 'ADMIN'].includes(profile?.role);
  const canVerifyTimetable = canManageTimetable && ['COORDINATOR', 'ADMIN'].includes(profile?.role);
  const canApproveTimetable = canManageTimetable && ['HOD', 'ADMIN'].includes(profile?.role);
  const canDeleteTimetable = canManageTimetable && ['COORDINATOR', 'ADMIN'].includes(profile?.role);
  const canExtendTimetable = canManageTimetable && ['COORDINATOR', 'ADMIN'].includes(profile?.role);

  const sortedDays = useMemo(() => {
    const source = days.length ? days : FALLBACK_DAYS;
    return [...source].sort((a, b) => (a.day_id || 0) - (b.day_id || 0));
  }, [days]);

  const sortedSlots = useMemo(() => {
    const source = slots.length ? slots : FALLBACK_SLOTS;
    return [...source].sort((a, b) => (a.slot_order || 0) - (b.slot_order || 0));
  }, [slots]);

  /** Division names that appear in this version's entries only (not full department / run selection). */
  const timetableDivisionNamesLabel = useMemo(() => {
    const ids = [...new Set((entries || []).map((e) => String(e.division_id)).filter(Boolean))];
    if (!ids.length) {
      return '';
    }
    const names = ids.map((id) => divisionNameMap.get(id) || id);
    names.sort((a, b) => a.localeCompare(b));
    return names.join(', ');
  }, [entries, divisionNameMap]);

  const fetchTimetableData = useCallback(async (targetVersionId) => {
    if (!targetVersionId) {
      setEntries([]);
      return;
    }

    try {
      setLoading(true);
      const [
        entriesRes,
        daysRes,
        slotsRes,
        divisionsRes,
        facultyRes,
        subjectsRes,
        roomsRes,
        versionsRes,
        departmentsRes,
        batchesRes,
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/timetable-entries?version_id=${encodeURIComponent(targetVersionId)}`),
        fetch(`${API_BASE_URL}/days`),
        fetch(`${API_BASE_URL}/time-slots`),
        fetch(`${API_BASE_URL}/divisions`),
        fetch(`${API_BASE_URL}/faculty`),
        fetch(`${API_BASE_URL}/subjects`),
        fetch(`${API_BASE_URL}/rooms`),
        fetch(`${API_BASE_URL}/timetable-versions`),
        fetch(`${API_BASE_URL}/departments`),
        fetch(`${API_BASE_URL}/batches`),
      ]);

      const responses = await Promise.all([
        entriesRes.json(),
        daysRes.json(),
        slotsRes.json(),
        divisionsRes.json(),
        facultyRes.json(),
        subjectsRes.json(),
        roomsRes.json(),
        versionsRes.json(),
        departmentsRes.json(),
        batchesRes.json(),
      ]);

      if (![entriesRes, daysRes, slotsRes, divisionsRes, facultyRes, subjectsRes, roomsRes, versionsRes, departmentsRes, batchesRes].every((res) => res.ok)) {
        throw new Error('Failed to load one or more timetable resources.');
      }

      const [entriesJson, daysJson, slotsJson, divisionsJson, facultyJson, subjectsJson, roomsJson, versionsJson, departmentsJson, batchesJson] = responses;

      const allEntries = entriesJson.data || [];
      
      // Filter entries based on division or faculty
      let scopedEntries = allEntries;
      
      if (forcedDivisionId) {
        // Filter by division (for student view)
        scopedEntries = allEntries.filter((entry) => String(entry.division_id) === String(forcedDivisionId));
      } else if (facultyFilterId && showOnlyFacultyView) {
        // Filter by faculty - show only entries where this faculty is teaching
        scopedEntries = allEntries.filter((entry) => String(entry.faculty_id) === String(facultyFilterId));
      }
      
      setEntries(scopedEntries);
      setDays((daysJson.data || []).length ? (daysJson.data || []) : FALLBACK_DAYS);
      setSlots((slotsJson.data || []).length ? (slotsJson.data || []) : FALLBACK_SLOTS);
      setDivisions(divisionsJson.data || []);
      setDepartments(departmentsJson.data || []);
      setFacultyRows(facultyJson.data || []);
      setRoomRows(roomsJson.data || []);

      setDivisionNameMap(makeLookupMap(divisionsJson.data || [], 'division_id', 'division_name'));
      setFacultyNameMap(makeLookupMap(facultyJson.data || [], 'faculty_id', 'faculty_name'));
      setSubjectNameMap(makeLookupMap(subjectsJson.data || [], 'subject_id', 'subject_name'));
      setSubjectShortMap(makeLookupMap(subjectsJson.data || [], 'subject_id', 'sub_short_form'));
      setBatchCodeMap(makeLookupMap(batchesJson.data || [], 'batch_id', 'batch_code'));
      setRoomNameMap(makeLookupMap(roomsJson.data || [], 'room_id', 'room_number'));
      setVersionMeta((versionsJson.data || []).find((item) => item.version_id === targetVersionId) || null);
    } catch (error) {
      console.error('Error loading timetable viewer data:', error);
      showToast(error.message || 'Failed to load timetable.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, forcedDivisionId, facultyFilterId, showOnlyFacultyView]);

  useEffect(() => {
    setEditedByEntryId({});
    setEditMode(false);
    setModalState({ open: false, section: null, entityId: null });
    fetchTimetableData(versionId);
  }, [versionId, fetchTimetableData]);

  useEffect(() => {
    setMetadataDraft({
      version_name: String(versionMeta?.version_name || ''),
      academic_year: String(versionMeta?.academic_year || ''),
      semester: String(versionMeta?.semester || ''),
      wef_date: String(versionMeta?.wef_date || ''),
      to_date: String(versionMeta?.to_date || ''),
    });
  }, [versionMeta]);

  const divisionCards = useMemo(() => {
    const counts = new Map();
    entries.forEach((entry) => {
      const key = String(entry.division_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      label: divisionNameMap.get(id) || id,
      count,
    })).sort(sortByCountThenName);
  }, [entries, divisionNameMap]);

  const roomCards = useMemo(() => {
    const counts = new Map();
    entries.forEach((entry) => {
      const key = String(entry.room_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      label: roomNameMap.get(id) || id,
      count,
    })).sort(sortByCountThenName);
  }, [entries, roomNameMap]);

  const facultyCards = useMemo(() => {
    const counts = new Map();
    entries.forEach((entry) => {
      const key = String(entry.faculty_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      label: facultyNameMap.get(id) || id,
      count,
    })).sort(sortByCountThenName);
  }, [entries, facultyNameMap]);

  const filteredCards = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) {
      return {
        divisions: divisionCards,
        rooms: roomCards,
        faculty: facultyCards,
      };
    }

    const filterFn = (card) => normalizeSearchText(card.label).includes(query);
    return {
      divisions: divisionCards.filter(filterFn),
      rooms: roomCards.filter(filterFn),
      faculty: facultyCards.filter(filterFn),
    };
  }, [divisionCards, roomCards, facultyCards, searchQuery]);

  const modalEntries = useMemo(() => {
    if (!modalState.open || !modalState.section || !modalState.entityId) {
      return [];
    }

    let filtered = [];
    if (modalState.section === 'division') {
      filtered = entries.filter((entry) => String(entry.division_id) === String(modalState.entityId));
    } else if (modalState.section === 'room') {
      filtered = entries.filter((entry) => String(entry.room_id) === String(modalState.entityId));
    } else {
      // Faculty section - show all entries for this faculty
      filtered = entries.filter((entry) => String(entry.faculty_id) === String(modalState.entityId));
    }

    // If faculty view is enabled AND viewing division/room (not their own faculty timetable),
    // further filter to show only this faculty's slots
    if (facultyFilterId && showOnlyFacultyView && modalState.section !== 'faculty') {
      filtered = filtered.filter((entry) => String(entry.faculty_id) === String(facultyFilterId));
    }

    return filtered;
  }, [entries, modalState, facultyFilterId, showOnlyFacultyView]);

  const modalCellMap = useMemo(() => {
    const map = new Map();
    modalEntries.forEach((entry) => {
      const key = `${entry.day_id}::${getSlotKey(entry)}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(entry);
    });
    return map;
  }, [modalEntries]);

  const modalTitle = useMemo(() => {
    if (!modalState.open) {
      return 'Timetable';
    }
    if (modalState.section === 'division') {
      return `Division Timetable : ${divisionNameMap.get(modalState.entityId) || modalState.entityId}`;
    }
    if (modalState.section === 'room') {
      return `Room Timetable : ${roomNameMap.get(modalState.entityId) || modalState.entityId}`;
    }
    return `Faculty Timetable : ${facultyNameMap.get(modalState.entityId) || modalState.entityId}`;
  }, [modalState, divisionNameMap, roomNameMap, facultyNameMap]);

  const handleRegenerate = async () => {
    try {
      setRegenerating(true);
      const response = await fetch(`${API_BASE_URL}/agents/create-timetable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: null,
          dry_run: false,
          reason: 'Regenerated from timetable tab',
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to regenerate timetable.');
      }

      const newVersionId = payload?.data?.version_id || null;
      if (!newVersionId) {
        throw new Error('Regeneration completed but version id was not returned.');
      }

      if (onVersionChange) {
        onVersionChange(newVersionId);
      }
      await fetchTimetableData(newVersionId);
      showToast('Timetable regenerated successfully.', 'success');
    } catch (error) {
      console.error('Regenerate timetable error:', error);
      showToast(error.message || 'Failed to regenerate timetable.', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const openModal = (section, entityId) => {
    setEditedByEntryId({});
    setEditMode(false);
    setModalState({ open: true, section, entityId });
  };

  const closeModal = () => {
    setEditedByEntryId({});
    setEditMode(false);
    setModalState({ open: false, section: null, entityId: null });
  };

  const onEditField = (entryId, field, value) => {
    setEditedByEntryId((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] || {}),
        [field]: value,
      },
    }));
  };

  const getMergedEntry = (entry) => {
    if (!entry?.entry_id) {
      return entry;
    }
    return {
      ...entry,
      ...(editedByEntryId[entry.entry_id] || {}),
    };
  };

  const saveManualEdits = async () => {
    try {
      const pending = Object.entries(editedByEntryId);
      if (!pending.length) {
        setEditMode(false);
        return;
      }

      const rowsById = new Map(entries.map((row) => [String(row.entry_id), row]));
      const updates = pending
        .map(([entryId, patch]) => {
          const original = rowsById.get(String(entryId));
          if (!original) {
            return null;
          }
          const changed = {};
          ['faculty_id', 'room_id', 'day_id', 'slot_id', 'session_type', 'batch_id'].forEach((field) => {
            if (patch[field] !== undefined && patch[field] !== original[field]) {
              changed[field] = patch[field];
            }
          });
          if (!Object.keys(changed).length) {
            return null;
          }
          return { entryId, changed };
        })
        .filter(Boolean);

      if (!updates.length) {
        setEditMode(false);
        setEditedByEntryId({});
        return;
      }

      setSavingEdits(true);
      for (const update of updates) {
        const response = await fetch(`${API_BASE_URL}/timetable-entries/${encodeURIComponent(update.entryId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update.changed),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.detail || `Failed to update entry ${update.entryId}.`);
        }
      }

      setEntries((prev) => prev.map((row) => {
        const patch = editedByEntryId[row.entry_id];
        return patch ? { ...row, ...patch } : row;
      }));

      setEditedByEntryId({});
      setEditMode(false);
      showToast('Timetable changes saved.', 'success');
    } catch (error) {
      console.error('Save timetable edits error:', error);
      showToast(error.message || 'Failed to save timetable changes.', 'error');
    } finally {
      setSavingEdits(false);
    }
  };

  const isPdfLibraryUnavailable = (message) => {
    if (!message || typeof message !== 'string') return false;
    const m = message.toLowerCase();
    return m.includes('reportlab') || m.includes('pdf generation library');
  };

  const printModal = async () => {
    if (!versionId) {
      showToast('Version ID not available', 'error');
      return;
    }
    
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (modalState?.section) {
        params.set('section', modalState.section);
      }
      if (modalState?.entityId) {
        params.set('entity_id', String(modalState.entityId));
      }
      const query = params.toString();
      const authHeaders = {
        Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
      };
      // Call backend PDF generation endpoint
      const response = await fetch(
        `${API_BASE_URL}/pdf/timetable/download/${encodeURIComponent(versionId)}${query ? `?${query}` : ''}`,
        {
          method: 'GET',
          headers: authHeaders,
        }
      );
      
      if (!response.ok) {
        let message = 'Failed to generate PDF';
        try {
          const errorPayload = await response.json();
          const detail = errorPayload?.detail;
          if (Array.isArray(detail)) {
            message = detail.map((item) => item?.msg || JSON.stringify(item)).join('; ') || message;
          } else if (detail) {
            message = typeof detail === 'string' ? detail : JSON.stringify(detail);
          }
        } catch {
          // Non-JSON error body; keep default message.
        }

        // ReportLab missing on server: HTML preview works without it (browser Print → Save as PDF).
        if (isPdfLibraryUnavailable(message)) {
          const previewUrl = `${API_BASE_URL}/pdf/timetable/preview/${encodeURIComponent(versionId)}${query ? `?${query}` : ''}`;
          const previewResp = await fetch(previewUrl, { method: 'GET', headers: authHeaders });
          if (!previewResp.ok) {
            throw new Error(message);
          }
          const htmlBlob = await previewResp.blob();
          const blobUrl = window.URL.createObjectURL(htmlBlob);
          window.open(blobUrl, '_blank', 'noopener,noreferrer');
          window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 120_000);
          showToast(
            'Opened a printable timetable in a new tab. Use Print → Save as PDF. For direct .pdf downloads, run the API with backend\\venv (pip install reportlab).',
            'success',
          );
          return;
        }

        throw new Error(message);
      }
      
      // Get the PDF blob
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)|filename="?([^";]+)"?/i);
      const responseFilename = filenameMatch
        ? decodeURIComponent((filenameMatch[1] || filenameMatch[2] || '').replace(/^"|"$/g, ''))
        : '';
      const fallbackFilename = `timetable_${new Date().getTime()}.pdf`;
      
      // Create a download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = responseFilename || fallbackFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast('PDF downloaded successfully', 'success');
    } catch (error) {
      console.error('PDF generation error:', error);
      showToast(error.message || 'Failed to generate PDF', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveMetadata = async () => {
    if (!versionId) {
      return;
    }
    try {
      setSavingMetadata(true);
      const payload = {
        version_name: metadataDraft.version_name || null,
        academic_year: metadataDraft.academic_year || null,
        semester: metadataDraft.semester || null,
        wef_date: metadataDraft.wef_date || null,
        to_date: metadataDraft.to_date || null,
      };

      const response = await fetch(`${API_BASE_URL}/timetable-versions/${encodeURIComponent(versionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || 'Failed to save timetable metadata.');
      }

      setVersionMeta((prev) => ({ ...(prev || {}), ...payload }));
      showToast('Timetable metadata saved.', 'success');
    } catch (error) {
      console.error('Save metadata error:', error);
      showToast(error.message || 'Failed to save timetable metadata.', 'error');
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleVerifyTimetable = async () => {
    if (!versionId) return;
    
    try {
      setApprovingTimetable(true);
      const token = localStorage.getItem('authToken') || '';
      const response = await fetch(`${API_BASE_URL}/timetable-versions/${encodeURIComponent(versionId)}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || 'Failed to verify timetable.');
      }

      setVersionMeta((prev) => ({ ...(prev || {}), approval_status: 'COORDINATOR_VERIFIED' }));
      showToast('Timetable verified and forwarded to HOD.', 'success');
      await fetchTimetableData(versionId);
    } catch (error) {
      console.error('Verify timetable error:', error);
      showToast(error.message || 'Failed to verify timetable.', 'error');
    } finally {
      setApprovingTimetable(false);
    }
  };

  const handleApproveTimetable = async () => {
    if (!versionId) return;
    
    try {
      setApprovingTimetable(true);
      const token = localStorage.getItem('authToken') || '';
      const response = await fetch(`${API_BASE_URL}/timetable-versions/${encodeURIComponent(versionId)}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || 'Failed to approve timetable.');
      }

      setVersionMeta((prev) => ({ ...(prev || {}), approval_status: 'HOD_APPROVED', is_active: true }));
      showToast('Timetable approved successfully.', 'success');
      await fetchTimetableData(versionId);
    } catch (error) {
      console.error('Approve timetable error:', error);
      showToast(error.message || 'Failed to approve timetable.', 'error');
    } finally {
      setApprovingTimetable(false);
    }
  };

  const handleRejectTimetable = async () => {
    if (!versionId) return;
    
    try {
      setRejectingTimetable(true);
      const token = localStorage.getItem('authToken') || '';
      const response = await fetch(`${API_BASE_URL}/timetable-versions/${encodeURIComponent(versionId)}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rejection_reason: rejectionReason || 'No reason provided' }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || 'Failed to reject timetable.');
      }

      setVersionMeta((prev) => ({ ...(prev || {}), approval_status: 'REJECTED', is_active: false }));
      setShowRejectModal(false);
      setRejectionReason('');
      showToast('Timetable rejected.', 'success');
      await fetchTimetableData(versionId);
    } catch (error) {
      console.error('Reject timetable error:', error);
      showToast(error.message || 'Failed to reject timetable.', 'error');
    } finally {
      setRejectingTimetable(false);
    }
  };

  const handleDeleteTimetable = async () => {
    if (!versionId) return;
    
    if (!confirm('Are you sure you want to delete this timetable version? This action cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken') || '';
      const response = await fetch(`${API_BASE_URL}/timetable-versions/${encodeURIComponent(versionId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || 'Failed to delete timetable.');
      }

      showToast('Timetable deleted successfully.', 'success');
      if (onVersionChange) {
        onVersionChange(null);
      }
    } catch (error) {
      console.error('Delete timetable error:', error);
      showToast(error.message || 'Failed to delete timetable.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTimetable = async () => {
    if (!versionId || !newToDate) return;
    
    try {
      setExtendingTimetable(true);
      const token = localStorage.getItem('authToken') || '';
      const response = await fetch(`${API_BASE_URL}/timetable-versions/${encodeURIComponent(versionId)}/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_to_date: newToDate }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.detail || 'Failed to extend timetable.');
      }

      setVersionMeta((prev) => ({ ...(prev || {}), to_date: newToDate, extension_requested: true }));
      setShowExtendModal(false);
      setNewToDate('');
      showToast(`Timetable validity extended to ${newToDate}`, 'success');
      await fetchTimetableData(versionId);
    } catch (error) {
      console.error('Extend timetable error:', error);
      showToast(error.message || 'Failed to extend timetable.', 'error');
    } finally {
      setExtendingTimetable(false);
    }
  };

  const getApprovalStatusBadge = () => {
    const status = versionMeta?.approval_status || 'DRAFT';
    const isFrozen = versionMeta?.is_frozen || false;
    
    const badges = {
      'DRAFT': { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-300' },
      'COORDINATOR_VERIFIED': { label: 'Verified', className: 'bg-teal-100 text-teal-700 border-teal-300' },
      'HOD_APPROVED': { 
        label: isFrozen ? '🔒 Approved & Frozen' : 'Approved', 
        className: 'bg-green-100 text-green-700 border-green-300' 
      },
      'REJECTED': { label: 'Rejected', className: 'bg-red-100 text-red-700 border-red-300' },
    };
    
    const badge = badges[status] || badges['DRAFT'];
    
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border-2 ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  const renderCardList = (title, sectionKey, cards) => (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-4 min-h-96 flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-[11px] text-gray-600">{cards.length} listed</span>
      </div>
      <div className="space-y-2 overflow-auto pr-1">
        {cards.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-xs text-gray-500">No matches found.</div>
        ) : cards.map((card) => (
          <button
            key={`${sectionKey}-${card.id}`}
            type="button"
            onClick={() => openModal(sectionKey, card.id)}
            className="w-full rounded-lg border-2 border-gray-200 bg-gray-50 p-3 text-left hover:border-teal-300 hover:bg-teal-50 transition-colors"
          >
            <p className="text-sm font-semibold text-gray-900 truncate">{card.label}</p>
            <p className="text-xs text-gray-600 mt-1">{card.count} sessions</p>
          </button>
        ))}
      </div>
    </div>
  );

  if (!versionId) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-center p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Timetable Viewer</h2>
          <p className="text-sm text-gray-600">Generate a timetable from Agent tab to open it here.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-target, .print-target * { visibility: visible !important; }
          .print-target { position: absolute; left: 0; top: 0; width: 100%; background: white !important; }
          .no-print { display: none !important; }
        }
        @page { size: landscape; margin: 10mm; }
      `}</style>

      <div className="space-y-5">
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-4 md:p-5">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Timetable Status</h2>
              {getApprovalStatusBadge()}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Coordinator: Verify button (DRAFT status only) */}
              {canVerifyTimetable && versionMeta?.approval_status === 'DRAFT' && (
                <button
                  type="button"
                  disabled={approvingTimetable || loading}
                  onClick={handleVerifyTimetable}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-teal-600 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {approvingTimetable ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Verify & Forward to HOD
                </button>
              )}
              
              {/* HOD: Approve button (COORDINATOR_VERIFIED status only) */}
              {canApproveTimetable && versionMeta?.approval_status === 'COORDINATOR_VERIFIED' && (
                <>
                  <button
                    type="button"
                    disabled={approvingTimetable || loading}
                    onClick={handleApproveTimetable}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-green-600 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {approvingTimetable ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Approve Timetable
                  </button>
                  <button
                    type="button"
                    disabled={rejectingTimetable || loading}
                    onClick={() => setShowRejectModal(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-red-600 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
              
              {/* Coordinator: Delete button (DRAFT or REJECTED status only) */}
              {canDeleteTimetable && (versionMeta?.approval_status === 'DRAFT' || versionMeta?.approval_status === 'REJECTED') && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleDeleteTimetable}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-red-600 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <X className="w-4 h-4" />
                  Delete Timetable
                </button>
              )}
            </div>
          </div>
          
          {/* Show rejection reason if rejected */}
          {versionMeta?.approval_status === 'REJECTED' && versionMeta?.rejection_reason && (
            <div className="mb-4 rounded-lg border-2 border-red-300 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700 mb-1">Rejection Reason:</p>
              <p className="text-xs text-red-600">{versionMeta.rejection_reason}</p>
            </div>
          )}
          
          {/* Show approval info if approved */}
          {versionMeta?.approval_status === 'HOD_APPROVED' && (
            <div className="mb-4 rounded-lg border-2 border-green-300 bg-green-50 p-3">
              <p className="text-sm font-semibold text-green-700">
                {versionMeta?.is_frozen ? '🔒 This timetable has been approved and frozen' : '✓ This timetable has been approved and is now active'}
              </p>
              {versionMeta?.approved_at && (
                <p className="text-xs text-green-600 mt-1">
                  Approved on: {new Date(versionMeta.approved_at).toLocaleString()}
                </p>
              )}
              {versionMeta?.is_frozen && versionMeta?.wef_date && versionMeta?.to_date && (
                <p className="text-xs text-green-600 mt-1">
                  Valid from {versionMeta.wef_date} to {versionMeta.to_date}
                </p>
              )}
              {canExtendTimetable && versionMeta?.is_frozen && (
                <button
                  type="button"
                  onClick={() => {
                    setNewToDate(versionMeta?.to_date || '');
                    setShowExtendModal(true);
                  }}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-yellow-600 bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors"
                >
                  Extend Validity Period
                </button>
              )}
            </div>
          )}
          
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search division, room, or faculty timetable..."
                className="w-full rounded-lg border-2 border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-teal-600 transition-colors"
              />
            </div>
            {canEditTimetable ? (
              <button
                type="button"
                disabled={regenerating || loading}
                onClick={handleRegenerate}
                className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-teal-600 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Regenerate Timetable
              </button>
            ) : null}
          </div>

          <div className="mt-4 rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[11px] md:text-xs font-semibold text-gray-900">
              <label className="flex flex-col gap-1 rounded border-2 border-gray-200 bg-white p-2">
                <span className="text-gray-600">Version Name</span>
                <input
                  type="text"
                  value={metadataDraft.version_name}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, version_name: event.target.value }))}
                  className="rounded border-2 border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                  placeholder="V1"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border-2 border-gray-200 bg-white p-2">
                <span className="text-gray-600">Academic Year</span>
                <input
                  type="text"
                  value={metadataDraft.academic_year}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, academic_year: event.target.value }))}
                  className="rounded border-2 border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                  placeholder="2025-26"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border-2 border-gray-200 bg-white p-2">
                <span className="text-gray-600">Semester</span>
                <input
                  type="text"
                  value={metadataDraft.semester}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, semester: event.target.value }))}
                  className="rounded border-2 border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                  placeholder="2"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border-2 border-gray-200 bg-white p-2">
                <span className="text-gray-600">W.E.F</span>
                <input
                  type="date"
                  value={metadataDraft.wef_date}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, wef_date: event.target.value }))}
                  className="rounded border-2 border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border-2 border-gray-200 bg-white p-2">
                <span className="text-gray-600">To Date</span>
                <input
                  type="date"
                  value={metadataDraft.to_date}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, to_date: event.target.value }))}
                  className="rounded border-2 border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                />
              </label>
            </div>

            {timetableDivisionNamesLabel ? (
              <div className="rounded border-2 border-gray-200 bg-white p-2 text-[11px] md:text-xs text-gray-900">
                <span className="font-semibold text-gray-600">Division(s) in this timetable: </span>
                <span className="text-gray-900">{timetableDivisionNamesLabel}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px] md:text-xs font-semibold text-gray-900">
              <div className="rounded border-2 border-gray-200 bg-white p-2 text-center">Version ID : {versionMeta?.version_id || versionId}</div>
              <div className="rounded border-2 border-gray-200 bg-white p-2 text-center">Divisions : {divisionCards.length}</div>
              <div className="rounded border-2 border-gray-200 bg-white p-2 text-center">Rooms : {roomCards.length}</div>
              <div className="rounded border-2 border-gray-200 bg-white p-2 text-center">Faculty : {facultyCards.length}</div>
            </div>

            {canEditTimetable ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={savingMetadata || loading}
                  onClick={saveMetadata}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-purple-600 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-60 transition-colors"
                >
                  {savingMetadata ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Metadata
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="h-[50vh] flex items-center justify-center gap-2 text-gray-700 rounded-2xl border-2 border-gray-100 bg-white">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading timetable workspace...
          </div>
        ) : showOnlyFacultyView ? (
          // Faculty view: Show their own timetable, divisions they teach, and room assignments
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-teal-200 bg-gradient-to-br from-teal-50 via-white to-teal-50 p-4">
              <h3 className="text-sm font-semibold text-teal-700 mb-2">Your Teaching Schedule</h3>
              <p className="text-xs text-gray-600">
                View your complete weekly timetable, divisions you teach, and room assignments.
              </p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {renderCardList('My Weekly Timetable', 'faculty', filteredCards.faculty)}
              {renderCardList('My Division Timetables', 'division', filteredCards.divisions)}
              {renderCardList('My Room Assignments', 'room', filteredCards.rooms)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {renderCardList('Division Timetables', 'division', filteredCards.divisions)}
            {renderCardList('Room Timetables', 'room', filteredCards.rooms)}
            {renderCardList('Faculty Timetables', 'faculty', filteredCards.faculty)}
          </div>
        )}
      </div>

      {modalState.open ? (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-auto">
          <div className="w-full max-w-7xl rounded-2xl border-2 border-gray-200 bg-white shadow-2xl print-target">
            <div className="no-print px-4 md:px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 via-white to-teal-50 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-semibold text-gray-900 tracking-tight">{modalTitle}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={printModal}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-teal-600 bg-gradient-to-r from-teal-600 to-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:from-teal-700 hover:to-teal-800 disabled:opacity-60 disabled:shadow-none transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {loading ? 'Generating PDF...' : 'Download PDF'}
                </button>
                {canEditTimetable ? (
                  <button
                    type="button"
                    onClick={() => setEditMode((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-yellow-600 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                    {editMode ? 'Cancel Edit' : 'Edit Manually'}
                  </button>
                ) : null}
                {editMode && canEditTimetable ? (
                  <button
                    type="button"
                    disabled={savingEdits}
                    onClick={saveManualEdits}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-teal-600 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60 transition-colors"
                  >
                    {savingEdits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              <div className="overflow-auto rounded-xl border-2 border-gray-200 bg-white shadow-sm">
                <table className="w-full min-w-350 text-[11px] border-collapse">
                  <thead className="bg-gradient-to-r from-teal-600 to-teal-700">
                    <tr>
                      <th className="text-left p-2.5 text-white border-b-2 border-teal-800 w-24 font-semibold tracking-wide">Slot / Day</th>
                      {sortedSlots.map((slot) => (
                        <th key={getSlotKey(slot)} className="text-center p-2.5 text-white border-b-2 border-teal-800 border-l border-teal-500 whitespace-nowrap font-medium">
                          {getSlotLabel(slot)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDays.map((day) => (
                      <tr key={day.day_id} className={day.is_working_day ? 'bg-white' : 'bg-gray-100'}>
                        <td className="p-2 text-teal-900 border-2 border-gray-300 bg-teal-50 font-semibold whitespace-nowrap align-top">{getDayLabel(day)}</td>
                        {sortedSlots.map((slot) => {
                          const entryList = modalCellMap.get(`${day.day_id}::${getSlotKey(slot)}`) || [];
                          return (
                            <td key={`${day.day_id}-${getSlotKey(slot)}`} className="align-top p-1.5 border-2 border-gray-300 text-gray-900 bg-gray-50">
                              {entryList.length === 0 ? (
                                <div className="min-h-14" />
                              ) : (
                                <div className="space-y-1 min-h-14">
                                  {entryList.map((entry, index) => {
                                    const merged = getMergedEntry(entry);
                                    // Try to get subject name from nested object first, then fall back to maps
                                    const shortName = merged.subjects?.sub_short_form || merged.subjects?.subject_name || subjectShortMap.get(merged.subject_id) || subjectNameMap.get(merged.subject_id) || merged.subject_id;
                                    const batchCode = merged.batch_id ? (merged.batches?.batch_code || batchCodeMap.get(merged.batch_id) || merged.batch_id) : null;
                                    const isLabOrTutorial = ['LAB', 'TUTORIAL'].includes((merged.session_type || '').toUpperCase());
                                    const identityLabel = modalState.section === 'faculty'
                                      ? (merged.divisions?.division_name || divisionNameMap.get(merged.division_id) || merged.division_id)
                                      : (merged.faculty?.faculty_name || facultyNameMap.get(merged.faculty_id) || merged.faculty_id);
                                    return (
                                      <div
                                        key={`${merged.entry_id || `${merged.day_id}-${merged.slot_id}`}-${index}`}
                                        className="grid grid-cols-[70px_1fr_72px_72px] rounded-md border border-sky-900/25 bg-gradient-to-br from-slate-50 via-white to-sky-50/90 text-[10px] text-gray-900 shadow-sm"
                                      >
                                        <div className="border-r border-slate-200 p-1 font-semibold leading-tight uppercase text-sky-950">{shortName}</div>
                                        <div className="border-r border-slate-200 p-1 leading-tight">
                                          <div className="font-semibold uppercase text-slate-800">{identityLabel}</div>
                                          {isLabOrTutorial ? (
                                            <div className="text-[9px] text-slate-600">Batch: {batchCode || 'Whole'}</div>
                                          ) : null}
                                        </div>
                                        <div
                                          className={`border-r border-slate-200/80 p-1 text-center leading-tight self-stretch flex items-center justify-center rounded-sm mx-0.5 my-0.5 text-[9px] font-bold uppercase border ${sessionTypeBadgeClass(merged.session_type)}`}
                                        >
                                          {merged.session_type || 'THEORY'}
                                        </div>
                                        <div className="p-1 text-center leading-tight text-slate-700 font-medium">{merged.rooms?.room_number || roomNameMap.get(merged.room_id) || merged.room_id}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editMode ? (
                <div className="no-print rounded-xl border border-white/10 bg-gray-950/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <Eye className="w-4 h-4" />
                    Manual edit mode is active. Change fields and click Save Changes.
                  </div>
                  <div className="space-y-2 max-h-72 overflow-auto pr-1">
                    {modalEntries.map((entry) => {
                      const merged = getMergedEntry(entry);
                      return (
                        <div key={entry.entry_id || `${entry.day_id}-${entry.slot_id}-${entry.room_id}`} className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-lg border border-white/10 bg-gray-900/60 p-2">
                          <select
                            value={String(merged.day_id || '')}
                            onChange={(event) => onEditField(entry.entry_id, 'day_id', Number(event.target.value))}
                            className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                          >
                            {sortedDays.map((day) => (
                              <option key={`day-${day.day_id}`} value={day.day_id}>{getDayLabel(day)}</option>
                            ))}
                          </select>

                          <select
                            value={String(merged.slot_id || '')}
                            onChange={(event) => onEditField(entry.entry_id, 'slot_id', event.target.value)}
                            className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                          >
                            {sortedSlots.map((slot) => (
                              <option key={`slot-${slot.slot_id}`} value={slot.slot_id}>{getSlotLabel(slot)}</option>
                            ))}
                          </select>

                          <select
                            value={String(merged.faculty_id || '')}
                            onChange={(event) => onEditField(entry.entry_id, 'faculty_id', event.target.value)}
                            className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                          >
                            {facultyRows.map((faculty) => (
                              <option key={`faculty-${faculty.faculty_id}`} value={faculty.faculty_id}>{faculty.faculty_name || faculty.faculty_id}</option>
                            ))}
                          </select>

                          <select
                            value={String(merged.room_id || '')}
                            onChange={(event) => onEditField(entry.entry_id, 'room_id', event.target.value)}
                            className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                          >
                            {roomRows.map((room) => (
                              <option key={`room-${room.room_id}`} value={room.room_id}>{room.room_number || room.room_id}</option>
                            ))}
                          </select>

                          <select
                            value={String(merged.session_type || 'THEORY')}
                            onChange={(event) => onEditField(entry.entry_id, 'session_type', event.target.value)}
                            className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                          >
                            {['THEORY', 'LAB', 'TUTORIAL'].map((kind) => (
                              <option key={`${entry.entry_id}-${kind}`} value={kind}>{kind}</option>
                            ))}
                          </select>

                          <select
                            value={String(merged.batch_id || '')}
                            onChange={(event) => onEditField(entry.entry_id, 'batch_id', event.target.value || null)}
                            className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                          >
                            <option value="">Whole Division</option>
                            {Array.from(batchCodeMap.entries()).map(([batchId, batchCode]) => (
                              <option key={`batch-${batchId}`} value={batchId}>{batchCode || batchId}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      
      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-red-300 bg-white shadow-2xl">
            <div className="px-6 py-4 border-b border-red-200">
              <h3 className="text-lg font-semibold text-gray-900">Reject Timetable</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please provide a reason for rejection..."
                  rows={4}
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-red-600 transition-colors"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 rounded-lg border-2 border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rejectingTimetable || !rejectionReason.trim()}
                  onClick={handleRejectTimetable}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-red-600 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {rejectingTimetable ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Reject Timetable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Extend Validity Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-yellow-300 bg-white shadow-2xl">
            <div className="px-6 py-4 border-b border-yellow-200">
              <h3 className="text-lg font-semibold text-gray-900">Extend Timetable Validity</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current End Date
                </label>
                <input
                  type="text"
                  value={versionMeta?.to_date || 'Not set'}
                  disabled
                  className="w-full rounded-lg border-2 border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New End Date
                </label>
                <input
                  type="date"
                  value={newToDate}
                  onChange={(e) => setNewToDate(e.target.value)}
                  min={versionMeta?.to_date || ''}
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-yellow-600 transition-colors"
                />
                <p className="text-xs text-gray-600 mt-1">
                  New date must be after the current end date
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowExtendModal(false);
                    setNewToDate('');
                  }}
                  className="px-4 py-2 rounded-lg border-2 border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={extendingTimetable || !newToDate}
                  onClick={handleExtendTimetable}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-yellow-600 bg-yellow-50 text-sm font-semibold text-yellow-700 hover:bg-yellow-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {extendingTimetable ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Extend Validity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
