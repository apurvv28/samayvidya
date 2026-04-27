'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, RefreshCw, Eye, X, FileDown, Pencil, Save } from 'lucide-react';

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

export default function TimetableViewer({ versionId, onVersionChange, canManageTimetable = false, forcedDivisionId = null }) {
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

  const canEditTimetable = canManageTimetable && ['COORDINATOR', 'ADMIN'].includes(profile?.role);

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
      const scopedEntries = forcedDivisionId
        ? allEntries.filter((entry) => String(entry.division_id) === String(forcedDivisionId))
        : allEntries;
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
  }, [showToast, forcedDivisionId]);

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

    if (modalState.section === 'division') {
      return entries.filter((entry) => String(entry.division_id) === String(modalState.entityId));
    }
    if (modalState.section === 'room') {
      return entries.filter((entry) => String(entry.room_id) === String(modalState.entityId));
    }
    return entries.filter((entry) => String(entry.faculty_id) === String(modalState.entityId));
  }, [entries, modalState]);

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

  const renderCardList = (title, sectionKey, cards) => (
    <div className="rounded-2xl border border-white/10 bg-gray-900/60 p-4 min-h-96 flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <span className="text-[11px] text-gray-400">{cards.length} listed</span>
      </div>
      <div className="space-y-2 overflow-auto pr-1">
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-gray-500">No matches found.</div>
        ) : cards.map((card) => (
          <button
            key={`${sectionKey}-${card.id}`}
            type="button"
            onClick={() => openModal(sectionKey, card.id)}
            className="w-full rounded-lg border border-white/10 bg-gray-800/60 p-3 text-left hover:border-cyan-300/40 hover:bg-gray-800 transition-colors"
          >
            <p className="text-sm font-semibold text-gray-100 truncate">{card.label}</p>
            <p className="text-xs text-gray-400 mt-1">{card.count} sessions</p>
          </button>
        ))}
      </div>
    </div>
  );

  if (!versionId) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-center p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Timetable Viewer</h2>
          <p className="text-sm text-gray-400">Generate a timetable from Agent tab to open it here.</p>
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

      <div className="p-6 md:p-8 space-y-5">
        <div className="rounded-2xl border border-white/10 bg-gray-900/70 p-4 md:p-5">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search division, room, or faculty timetable..."
                className="w-full rounded-lg border border-white/10 bg-gray-950/70 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
            {canEditTimetable ? (
              <button
                type="button"
                disabled={regenerating || loading}
                onClick={handleRegenerate}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Regenerate Timetable
              </button>
            ) : null}
          </div>

          <div className="mt-4 rounded-lg overflow-hidden border border-white/10 bg-gray-950/40 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[11px] md:text-xs font-semibold text-gray-100">
              <label className="flex flex-col gap-1 rounded border border-white/10 p-2">
                <span className="text-gray-400">Version Name</span>
                <input
                  type="text"
                  value={metadataDraft.version_name}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, version_name: event.target.value }))}
                  className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                  placeholder="V1"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border border-white/10 p-2">
                <span className="text-gray-400">Academic Year</span>
                <input
                  type="text"
                  value={metadataDraft.academic_year}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, academic_year: event.target.value }))}
                  className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                  placeholder="2025-26"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border border-white/10 p-2">
                <span className="text-gray-400">Semester</span>
                <input
                  type="text"
                  value={metadataDraft.semester}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, semester: event.target.value }))}
                  className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                  placeholder="2"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border border-white/10 p-2">
                <span className="text-gray-400">W.E.F</span>
                <input
                  type="date"
                  value={metadataDraft.wef_date}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, wef_date: event.target.value }))}
                  className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="flex flex-col gap-1 rounded border border-white/10 p-2">
                <span className="text-gray-400">To Date</span>
                <input
                  type="date"
                  value={metadataDraft.to_date}
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, to_date: event.target.value }))}
                  className="rounded border border-white/10 bg-gray-800 px-2 py-1 text-xs text-gray-100"
                />
              </label>
            </div>

            {timetableDivisionNamesLabel ? (
              <div className="rounded border border-white/10 bg-gray-950/50 p-2 text-[11px] md:text-xs text-gray-200">
                <span className="font-semibold text-gray-400">Division(s) in this timetable: </span>
                <span className="text-gray-100">{timetableDivisionNamesLabel}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px] md:text-xs font-semibold text-gray-100">
              <div className="rounded border border-white/10 p-2 text-center">Version ID : {versionMeta?.version_id || versionId}</div>
              <div className="rounded border border-white/10 p-2 text-center">Divisions : {divisionCards.length}</div>
              <div className="rounded border border-white/10 p-2 text-center">Rooms : {roomCards.length}</div>
              <div className="rounded border border-white/10 p-2 text-center">Faculty : {facultyCards.length}</div>
            </div>

            {canEditTimetable ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={savingMetadata || loading}
                  onClick={saveMetadata}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-60"
                >
                  {savingMetadata ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Metadata
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="h-[50vh] flex items-center justify-center gap-2 text-gray-300 rounded-2xl border border-white/10 bg-gray-900/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading timetable workspace...
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
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-start justify-center p-4 md:p-8 overflow-auto">
          <div className="w-full max-w-7xl rounded-2xl border border-teal-500/25 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-teal-950/20 print-target">
            <div className="no-print px-4 md:px-6 py-4 border-b border-teal-500/20 bg-gradient-to-r from-slate-900/98 via-slate-900/90 to-blue-950/35 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-semibold text-white tracking-tight">{modalTitle}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={printModal}
                  className="inline-flex items-center gap-2 rounded-lg border border-teal-400/50 bg-gradient-to-r from-teal-600/90 to-cyan-600/85 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-teal-950/40 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-60 disabled:shadow-none transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                  {loading ? 'Generating PDF...' : 'Download PDF'}
                </button>
                {canEditTimetable ? (
                  <button
                    type="button"
                    onClick={() => setEditMode((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
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
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
                  >
                    {savingEdits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700"
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-4">
              <div className="overflow-auto rounded-xl border border-sky-500/15 bg-slate-950/30 shadow-inner">
                <table className="w-full min-w-350 text-[11px] border-collapse">
                  <thead className="bg-gradient-to-r from-[#0B1F3A] to-[#1565C0]">
                    <tr>
                      <th className="text-left p-2.5 text-white/95 border-b-2 border-teal-400 w-24 font-semibold tracking-wide">Slot / Day</th>
                      {sortedSlots.map((slot) => (
                        <th key={getSlotKey(slot)} className="text-center p-2.5 text-white/95 border-b-2 border-teal-400 border-l border-white/10 whitespace-nowrap font-medium">
                          {getSlotLabel(slot)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDays.map((day) => (
                      <tr key={day.day_id} className={day.is_working_day ? 'bg-slate-950/20' : 'bg-slate-950/55'}>
                        <td className="p-2 text-sky-100 border border-slate-700/60 bg-sky-950/35 font-semibold whitespace-nowrap align-top">{getDayLabel(day)}</td>
                        {sortedSlots.map((slot) => {
                          const entryList = modalCellMap.get(`${day.day_id}::${getSlotKey(slot)}`) || [];
                          return (
                            <td key={`${day.day_id}-${getSlotKey(slot)}`} className="align-top p-1.5 border border-slate-700/50 text-slate-200 bg-slate-900/25">
                              {entryList.length === 0 ? (
                                <div className="min-h-14" />
                              ) : (
                                <div className="space-y-1 min-h-14">
                                  {entryList.map((entry, index) => {
                                    const merged = getMergedEntry(entry);
                                    const shortName = subjectShortMap.get(merged.subject_id) || subjectNameMap.get(merged.subject_id) || merged.subject_id;
                                    const batchCode = merged.batch_id ? (batchCodeMap.get(merged.batch_id) || merged.batch_id) : null;
                                    const isLabOrTutorial = ['LAB', 'TUTORIAL'].includes((merged.session_type || '').toUpperCase());
                                    const identityLabel = modalState.section === 'faculty'
                                      ? (divisionNameMap.get(merged.division_id) || merged.division_id)
                                      : (facultyNameMap.get(merged.faculty_id) || merged.faculty_id);
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
                                        <div className="p-1 text-center leading-tight text-slate-700 font-medium">{roomNameMap.get(merged.room_id) || merged.room_id}</div>
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
    </>
  );
}
