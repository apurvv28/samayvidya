'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BrainCircuit, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { useToast } from '../../context/ToastContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const STAGE_ORDER = [
  'Data Ingestion Agent',
  'Curriculum + Faculty + Division Planning Agents',
  'Resource + Constraint Handling + Schedule Optimization Agents',
  'Notification Agent',
];

function parseSseEvent(rawEventBlock) {
  const lines = rawEventBlock.split('\n');
  let event = 'message';
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  });

  const dataText = dataLines.join('\n');
  const parsedData = dataText ? JSON.parse(dataText) : null;
  return { event, data: parsedData };
}

export default function AgentOrchestrator({ onTimetableCreated, onViewTimetable }) {
  const { showToast } = useToast();
  const [loadingReadiness, setLoadingReadiness] = useState(true);
  const [readiness, setReadiness] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [planInput, setPlanInput] = useState({
    department_id: '',
    academic_year: '2025-26',
    semester: 'Semester 2',
    program: 'BTech CSE (Artificial Intelligence)',
    effective_from: '2026-01-05',
    effective_to: '2026-05-31',
    selected_division_ids: [],
  });
  const runLockRef = useRef(false);

  const stageMap = useMemo(() => {
    const map = new Map();
    (result?.stages || []).forEach((stage) => {
      map.set(stage.agent, stage);
    });
    return map;
  }, [result]);

  const fetchReadiness = async (departmentId = '') => {
    try {
      setLoadingReadiness(true);
      const query = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : '';
      const response = await fetch(`${API_BASE_URL}/agents/input-readiness${query}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || 'Failed to fetch input readiness.');
      }

      const data = payload.data || {};
      setReadiness(data);
      setPlanInput((prev) => {
        const defaults = data.defaults || {};
        const divisionOptions = data.division_options || [];
        const selectedDivisionIds =
          prev.selected_division_ids.length > 0
            ? prev.selected_division_ids
            : divisionOptions.map((option) => option.division_id).filter(Boolean);

        return {
          ...prev,
          department_id: departmentId || prev.department_id,
          academic_year: defaults.academic_year || prev.academic_year,
          semester: defaults.semester || prev.semester,
          program: defaults.program || prev.program,
          effective_from: defaults.effective_from || prev.effective_from,
          effective_to: defaults.effective_to || prev.effective_to,
          selected_division_ids: selectedDivisionIds,
        };
      });
    } catch (error) {
      console.error('Error loading input readiness:', error);
      showToast(error.message || 'Unable to fetch readiness data.', 'error');
      setReadiness(null);
    } finally {
      setLoadingReadiness(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, []);

  const toggleDivisionSelection = (divisionId) => {
    setPlanInput((prev) => {
      const selected = new Set(prev.selected_division_ids);
      if (selected.has(divisionId)) {
        selected.delete(divisionId);
      } else {
        selected.add(divisionId);
      }
      return {
        ...prev,
        selected_division_ids: [...selected],
      };
    });
  };

  const handleCreateTimetable = async () => {
    if (runLockRef.current) {
      return;
    }

    if (!readiness) {
      showToast('Readiness data not loaded yet. Please refresh once.', 'error');
      return;
    }

    if ((readiness.blocking_issues || []).length > 0) {
      showToast('Resolve blocking input issues before running timetable generation.', 'error');
      return;
    }

    if (!planInput.selected_division_ids.length) {
      showToast('Select at least one division to proceed.', 'error');
      return;
    }

    try {
      runLockRef.current = true;
      setRunning(true);
      setResult(null);

      const runContext = {
        academic_year: planInput.academic_year,
        semester: planInput.semester,
        program: planInput.program,
        effective_from: planInput.effective_from,
        effective_to: planInput.effective_to,
        selected_divisions: planInput.selected_division_ids,
      };

      const response = await fetch(`${API_BASE_URL}/agents/create-timetable/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          department_id: planInput.department_id || null,
          reason: `UI run context: ${JSON.stringify(runContext)}`,
          dry_run: false,
        }),
      });

      if (!response.ok || !response.body) {
        const fallback = await response.json().catch(() => null);
        throw new Error(fallback?.detail || 'Failed to start orchestration stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      const upsertStage = (stagePayload) => {
        setResult((prev) => {
          const base = prev || { run_id: null, stages: [] };
          const existing = (base.stages || []).filter((stage) => stage.agent !== stagePayload.agent);
          return {
            ...base,
            stages: [...existing, stagePayload],
          };
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) {
            continue;
          }

          const parsed = parseSseEvent(block);
          if (!parsed?.data) {
            continue;
          }

          if (parsed.event === 'stage') {
            const payload = parsed.data;
            setResult((prev) => {
              const base = prev || { stages: [] };
              return {
                ...base,
                run_id: payload.run_id || base.run_id || null,
              };
            });
            if (payload.stage) {
              upsertStage(payload.stage);
            }
            continue;
          }

          if (parsed.event === 'result') {
            const payload = parsed.data?.result || null;
            setResult(payload);
            if (payload?.version_id && onTimetableCreated) {
              onTimetableCreated(payload.version_id);
            }
            completed = true;
            break;
          }

          if (parsed.event === 'error') {
            throw new Error(parsed.data?.detail || 'Orchestration stream failed.');
          }
        }

        if (completed) {
          await reader.cancel().catch(() => {});
          break;
        }
      }

      showToast('Timetable created successfully.', 'success');
    } catch (error) {
      console.error('Error creating timetable from agent orchestration:', error);
      showToast(error.message || 'Orchestration failed.', 'error');
    } finally {
      setRunning(false);
      runLockRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-gray-100 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Timetable Inputs (Auto-filled from Supabase)</h3>
            <p className="text-xs text-gray-600 mt-1">
              Rooms, divisions, subjects, and faculty are read directly from master tables; load-distribution is validated before run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchReadiness(planInput.department_id)}
            disabled={loadingReadiness}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-teal-600 px-3 py-2 text-xs font-semibold text-teal-600 hover:bg-teal-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingReadiness ? 'animate-spin' : ''}`} />
            Refresh from Supabase
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Department</label>
            <select
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
              value={planInput.department_id}
              onChange={async (event) => {
                const nextDepartmentId = event.target.value;
                setPlanInput((prev) => ({
                  ...prev,
                  department_id: nextDepartmentId,
                  selected_division_ids: [],
                }));
                await fetchReadiness(nextDepartmentId);
              }}
            >
              <option value="">All Departments</option>
              {(readiness?.departments || []).map((department) => (
                <option key={department.department_id} value={department.department_id}>
                  {department.department_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Academic Year</label>
            <input
              type="text"
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
              value={planInput.academic_year}
              onChange={(event) => setPlanInput((prev) => ({ ...prev, academic_year: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Semester</label>
            <input
              type="text"
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
              value={planInput.semester}
              onChange={(event) => setPlanInput((prev) => ({ ...prev, semester: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-600 mb-1 font-medium">Program</label>
            <input
              type="text"
              className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
              value={planInput.program}
              onChange={(event) => setPlanInput((prev) => ({ ...prev, program: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-medium">Effective Dates</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-2 py-2 text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                value={planInput.effective_from}
                onChange={(event) => setPlanInput((prev) => ({ ...prev, effective_from: event.target.value }))}
              />
              <input
                type="date"
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-2 py-2 text-gray-900 focus:border-teal-600 focus:outline-none transition-colors"
                value={planInput.effective_to}
                onChange={(event) => setPlanInput((prev) => ({ ...prev, effective_to: event.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-900">Divisions Included in Generation</p>
          {!readiness?.division_options?.length ? (
            <p className="text-xs text-gray-600">No divisions found in current scope.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {readiness.division_options.map((division) => {
                const checked = planInput.selected_division_ids.includes(division.division_id);
                return (
                  <label
                    key={division.division_id}
                    className="flex items-center gap-2 rounded border-2 border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 hover:border-teal-300 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDivisionSelection(division.division_id)}
                      className="accent-teal-600"
                    />
                    {division.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-xs">
          {[
            ['load rows', readiness?.counts?.load_rows || 0],
            ['faculty', readiness?.counts?.faculty || 0],
            ['subjects', readiness?.counts?.subjects || 0],
            ['divisions', readiness?.counts?.divisions || 0],
            ['rooms', readiness?.counts?.rooms || 0],
            ['classrooms', readiness?.counts?.classrooms || 0],
            ['labs', readiness?.counts?.labs || 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border-2 border-gray-200 bg-gray-50 px-2 py-2">
              <p className="text-gray-600 uppercase font-medium">{label}</p>
              <p className="text-gray-900 font-semibold text-base">{value}</p>
            </div>
          ))}
        </div>

        {(readiness?.blocking_issues || []).length > 0 ? (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-700 mb-2">Blocking Issues</p>
            <ul className="text-xs text-red-600 list-disc pl-4 space-y-1">
              {(readiness?.blocking_issues || []).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-green-700 font-medium">All core inputs are ready. You can run generation now.</p>
        )}
      </div>

      <div className="rounded-2xl border-2 border-teal-200 bg-gradient-to-br from-teal-50 via-white to-teal-50 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-teal-600 font-semibold">Agent Orchestration</p>
            <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2" style={{ fontFamily: "'Times New Roman', serif" }}>
              <BrainCircuit className="w-6 h-6 text-teal-600" />
              Multi-Agent Timetable Creator
            </h2>
            <p className="text-sm text-gray-700 max-w-2xl">
              Single-click orchestration through planning, allocation, constraint resolution, and optimization agents.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCreateTimetable}
            disabled={running || loadingReadiness || (readiness?.blocking_issues || []).length > 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {running ? 'Orchestrating...' : 'Create Timetable'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {STAGE_ORDER.map((stageName) => {
          const stage = stageMap.get(stageName);
          const completed = stage?.status === 'completed';
          const hasData = Boolean(stage);

          return (
            <div key={stageName} className="rounded-xl border-2 border-gray-100 bg-white p-4 space-y-3 hover:border-teal-200 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-900 leading-snug">{stageName}</h3>
                {running && !hasData ? (
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                ) : completed ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-gray-400" />
                )}
              </div>

              <p className="text-xs text-gray-600 min-h-9">
                {stage?.message || (running ? 'Running stage...' : 'Waiting for execution')}
              </p>

              {stage?.metrics ? (
                <div className="space-y-1 text-[11px] text-gray-700">
                  {Object.entries(stage.metrics).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-gray-600">{key.replaceAll('_', ' ')}</span>
                      <span className="font-mono text-gray-900 font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border-2 border-gray-100 bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Final Optimized Timetable</h3>
        {!result ? (
          <p className="text-sm text-gray-600">Run orchestration to generate and persist a timetable version.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-teal-50 border-2 border-teal-200 p-3">
                <p className="text-gray-600 font-medium">Run ID</p>
                <p className="font-mono text-gray-900 break-all text-xs">{result.run_id}</p>
              </div>
              <div className="rounded-lg bg-green-50 border-2 border-green-200 p-3">
                <p className="text-gray-600 font-medium">Version ID</p>
                <p className="font-mono text-gray-900 break-all text-xs">{result.version_id || 'Not persisted'}</p>
              </div>
              <div className="rounded-lg bg-purple-50 border-2 border-purple-200 p-3">
                <p className="text-gray-600 font-medium">Sessions</p>
                <p className="font-mono text-gray-900 text-base font-semibold">
                  {result.summary?.scheduled_sessions || 0}/{result.summary?.requested_sessions || 0}
                </p>
              </div>
            </div>

            {result.version_id && onViewTimetable ? (
              <div>
                <button
                  type="button"
                  onClick={onViewTimetable}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors"
                >
                  Open This Version In Timetable Tab
                </button>
              </div>
            ) : null}

            <div className="text-xs text-gray-700 max-h-56 overflow-auto rounded-lg bg-gray-50 border-2 border-gray-200 p-3">
              <p className="mb-2 text-gray-900 font-medium">Sample scheduled entries</p>
              <pre className="whitespace-pre-wrap wrap-break-word">
                {JSON.stringify((result.final_timetable || []).slice(0, 10), null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}