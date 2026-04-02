'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';

import { useToast } from '../../context/ToastContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function makeLookupMap(rows, idKey, nameKey) {
  const map = new Map();
  (rows || []).forEach((row) => {
    if (row?.[idKey]) {
      map.set(row[idKey], row?.[nameKey] || row[idKey]);
    }
  });
  return map;
}

export default function TimetableViewer({ versionId }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [days, setDays] = useState([]);
  const [slots, setSlots] = useState([]);
  const [divisionNameMap, setDivisionNameMap] = useState(new Map());
  const [facultyNameMap, setFacultyNameMap] = useState(new Map());
  const [subjectNameMap, setSubjectNameMap] = useState(new Map());
  const [roomNameMap, setRoomNameMap] = useState(new Map());

  useEffect(() => {
    const fetchTimetableData = async () => {
      if (!versionId) {
        setEntries([]);
        return;
      }

      try {
        setLoading(true);
        const [entriesRes, daysRes, slotsRes, divisionsRes, facultyRes, subjectsRes, roomsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/timetable-entries?version_id=${encodeURIComponent(versionId)}`),
          fetch(`${API_BASE_URL}/days`),
          fetch(`${API_BASE_URL}/time-slots`),
          fetch(`${API_BASE_URL}/divisions`),
          fetch(`${API_BASE_URL}/faculty`),
          fetch(`${API_BASE_URL}/subjects`),
          fetch(`${API_BASE_URL}/rooms`),
        ]);

        const responses = await Promise.all([
          entriesRes.json(),
          daysRes.json(),
          slotsRes.json(),
          divisionsRes.json(),
          facultyRes.json(),
          subjectsRes.json(),
          roomsRes.json(),
        ]);

        if (![entriesRes, daysRes, slotsRes, divisionsRes, facultyRes, subjectsRes, roomsRes].every((res) => res.ok)) {
          throw new Error('Failed to load one or more timetable resources.');
        }

        const [entriesJson, daysJson, slotsJson, divisionsJson, facultyJson, subjectsJson, roomsJson] = responses;

        setEntries(entriesJson.data || []);
        setDays((daysJson.data || []).filter((day) => day.is_working_day));
        setSlots((slotsJson.data || []).filter((slot) => !slot.is_break));
        setDivisionNameMap(makeLookupMap(divisionsJson.data || [], 'division_id', 'division_name'));
        setFacultyNameMap(makeLookupMap(facultyJson.data || [], 'faculty_id', 'faculty_name'));
        setSubjectNameMap(makeLookupMap(subjectsJson.data || [], 'subject_id', 'subject_name'));
        setRoomNameMap(makeLookupMap(roomsJson.data || [], 'room_id', 'room_number'));
      } catch (error) {
        console.error('Error loading timetable viewer data:', error);
        showToast(error.message || 'Failed to load timetable.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchTimetableData();
  }, [versionId, showToast]);

  const groupedByDivision = useMemo(() => {
    const grouped = new Map();
    entries.forEach((entry) => {
      const divisionId = entry.division_id;
      if (!grouped.has(divisionId)) {
        grouped.set(divisionId, []);
      }
      grouped.get(divisionId).push(entry);
    });
    return grouped;
  }, [entries]);

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

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center gap-2 text-gray-300">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading timetable version {versionId}...
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="rounded-xl border border-blue-500/20 bg-linear-to-br from-slate-900 via-gray-900 to-blue-950/30 p-5">
        <div className="flex items-center gap-2 text-blue-200">
          <CalendarDays className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-white">Timetable Grid Viewer</h2>
        </div>
        <p className="mt-2 text-sm text-gray-300">Showing version: <span className="font-mono text-blue-200">{versionId}</span></p>
      </div>

      {groupedByDivision.size === 0 ? (
        <div className="rounded-xl border border-white/10 bg-gray-900/60 p-4 text-sm text-gray-400">
          No entries found for this timetable version.
        </div>
      ) : (
        Array.from(groupedByDivision.entries()).map(([divisionId, divisionEntries]) => {
          const cellMap = new Map();
          divisionEntries.forEach((entry) => {
            cellMap.set(`${entry.day_id}::${entry.slot_id}`, entry);
          });

          const sortedDays = [...days].sort((a, b) => a.day_id - b.day_id);
          const sortedSlots = [...slots].sort((a, b) => a.slot_order - b.slot_order);

          return (
            <div key={divisionId} className="rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-gray-100">
                  Division: {divisionNameMap.get(divisionId) || divisionId}
                </h3>
              </div>

              <div className="overflow-auto">
                <table className="w-full min-w-225 text-xs">
                  <thead className="bg-gray-800/70">
                    <tr>
                      <th className="text-left p-2 text-gray-300 border-b border-white/10">Day / Slot</th>
                      {sortedSlots.map((slot) => (
                        <th key={slot.slot_id} className="text-left p-2 text-gray-300 border-b border-white/10">
                          {slot.start_time} - {slot.end_time}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDays.map((day) => (
                      <tr key={day.day_id}>
                        <td className="p-2 text-gray-200 border-b border-white/5 font-medium">{day.day_name}</td>
                        {sortedSlots.map((slot) => {
                          const entry = cellMap.get(`${day.day_id}::${slot.slot_id}`);
                          return (
                            <td key={slot.slot_id} className="align-top p-2 border-b border-white/5 text-gray-300">
                              {!entry ? (
                                <span className="text-gray-600">-</span>
                              ) : (
                                <div className="space-y-1 rounded-md border border-blue-500/20 bg-blue-500/5 p-2">
                                  <div className="font-semibold text-blue-100">
                                    {subjectNameMap.get(entry.subject_id) || entry.subject_id}
                                  </div>
                                  <div>{facultyNameMap.get(entry.faculty_id) || entry.faculty_id}</div>
                                  <div>Room: {roomNameMap.get(entry.room_id) || entry.room_id}</div>
                                  <div className="text-[10px] text-blue-200">{entry.session_type}</div>
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
            </div>
          );
        })
      )}
    </div>
  );
}