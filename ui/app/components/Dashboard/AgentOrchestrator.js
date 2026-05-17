'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BrainCircuit, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useToast } from '../../context/ToastContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function authHeaders(extra = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') || '' : '';
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

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
  const [criticRunning, setCriticRunning] = useState(false);
  const [criticResult, setCriticResult] = useState(null);
  const [resolverRunning, setResolverRunning] = useState(false);
  const [resolverResult, setResolverResult] = useState(null);
  const [showUnresolvableModal, setShowUnresolvableModal] = useState(false);
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
      const response = await fetch(`${API_BASE_URL}/agents/input-readiness${query}`, {
        headers: authHeaders(),
      });
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

  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const confirmGenerateTimetable = () => {
    if ((readiness?.blocking_issues || []).length > 0 || !planInput.selected_division_ids.length) {
      handleCreateTimetable(); // will just show errors
      return;
    }
    setShowRegenerateConfirm(true);
  };

  const handleCreateTimetable = async () => {
    setShowRegenerateConfirm(false);
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
      setCriticResult(null);
      setResolverResult(null);

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
        headers: authHeaders({ 'Content-Type': 'application/json' }),
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

  const handleRunCriticAgent = async () => {
    try {
      setCriticRunning(true);
      setCriticResult(null);
      setResolverResult(null);
      const selectedVersionId = result?.version_id || null;
      const response = await fetch(`${API_BASE_URL}/agents/criticize-timetable`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          version_id: selectedVersionId,
          department_id: planInput.department_id || null,
          stress_hour_threshold: 4,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to run Special AI Critic Agent.');
      }
      setCriticResult(payload.data || null);
      showToast('Special AI Critic Agent completed.', 'success');
    } catch (error) {
      console.error('Error running critic agent:', error);
      showToast(error.message || 'Failed to run critic agent.', 'error');
    } finally {
      setCriticRunning(false);
    }
  };

  const handleSolveIssues = async () => {
    const selectedVersionId = criticResult?.version_id || result?.version_id || null;
    try {
      setResolverRunning(true);
      setResolverResult(null);
      setShowUnresolvableModal(false);
      const response = await fetch(`${API_BASE_URL}/agents/resolve-timetable-issues`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          version_id: selectedVersionId,
          department_id: planInput.department_id || null,
          stress_hour_threshold: 4,
          max_iterations: 6,
          allow_relax: true,
          dry_run: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const detail = payload?.detail;
        const message =
          typeof detail === 'string'
            ? detail
            : detail?.message || 'Failed to resolve timetable issues.';
        if (response.status === 409) {
          throw new Error(
            message.includes('frozen')
              ? `${message} Ask your HOD to unfreeze the timetable from the HOD dashboard.`
              : message
          );
        }
        throw new Error(message);
      }
      const data = payload.data || null;
      setResolverResult(data);
      const newVersionId = data?.version_id || data?.resolved_version_id;
      if (newVersionId && onTimetableCreated) {
        onTimetableCreated(newVersionId);
      }
      if (newVersionId) {
        setResult((prev) => ({
          ...(prev || {}),
          version_id: newVersionId,
        }));
      }
      if (data?.post_critique) {
        setCriticResult(data.post_critique);
      }
      if ((data?.unresolvable || []).length > 0) {
        setShowUnresolvableModal(true);
      }
      showToast('Issue Resolver team completed. Updated timetable version is ready.', 'success');
    } catch (error) {
      console.error('Error running issue resolver:', error);
      showToast(error.message || 'Failed to solve timetable issues.', 'error');
    } finally {
      setResolverRunning(false);
    }
  };

  const openManualEditForUnresolvable = () => {
    const entryIds = (resolverResult?.unresolvable || [])
      .map((row) => row.entry_id)
      .filter(Boolean);
    if (entryIds.length && typeof window !== 'undefined') {
      sessionStorage.setItem('tt_highlight_entries', JSON.stringify(entryIds));
    }
    setShowUnresolvableModal(false);
    if (onViewTimetable) {
      onViewTimetable();
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
            onClick={confirmGenerateTimetable}
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

      <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-700 font-semibold">Special AI Critic Agent</p>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
              Timetable Quality Critic
            </h3>
            <p className="text-sm text-gray-700 mt-1">
              Manually critiques generated timetable for conflicts and stress patterns using Amazon Nova Pro.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunCriticAgent}
            disabled={criticRunning}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
          >
            {criticRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            {criticRunning ? 'Critic Running...' : 'Run Special AI Critic Agent'}
          </button>
        </div>

        {!criticResult ? (
          <p className="text-sm text-gray-600">
            Critiques the current generated version if available, otherwise falls back to latest active timetable.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              {[
                ['Total issues', criticResult?.summary?.total_issues || 0],
                ['Critical', criticResult?.summary?.critical || 0],
                ['High', criticResult?.summary?.high || 0],
                ['Medium', criticResult?.summary?.medium || 0],
                ['Low', criticResult?.summary?.low || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border-2 border-amber-200 bg-white px-2 py-2">
                  <p className="text-gray-600 uppercase font-medium">{label}</p>
                  <p className="text-gray-900 font-semibold text-base">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border-2 border-gray-200 bg-white p-3 space-y-2">
              <p className="text-sm font-semibold text-gray-900">Detected Issues</p>
              {!criticResult?.issues?.length ? (
                <p className="text-sm text-green-700">No major issues were flagged in this run.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {criticResult.issues.map((issue, index) => (
                    <div key={`${issue.type}-${index}`} className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{issue.title}</p>
                        <span className="text-[11px] uppercase font-semibold text-amber-700">{issue.severity}</span>
                      </div>
                      <p className="text-xs text-gray-700 mt-1">{issue.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border-2 border-gray-200 bg-white p-3 space-y-3">
              <button
                type="button"
                onClick={handleSolveIssues}
                disabled={resolverRunning}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
              >
                {resolverRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {resolverRunning ? 'Solving Issues...' : 'Solve Issues'}
              </button>

              {resolverResult ? (
                <div className="space-y-3 text-xs text-gray-800">
                  <p className="font-semibold text-gray-900">Issue Resolver Team Result</p>
                  {(resolverResult?.resolved_with_relaxation || 0) > 0 ? (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900">
                      {resolverResult.resolved_with_relaxation} entries were resolved by relaxing soft constraints.
                      Review highlighted slots.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-600">Baseline</p>
                      <p className="font-semibold">
                        {resolverResult?.baseline_issues ??
                          resolverResult?.resolution_summary?.baseline_issues ??
                          0}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-600">Remaining</p>
                      <p className="font-semibold">
                        {resolverResult?.remaining_issues ??
                          resolverResult?.resolution_summary?.remaining_issues ??
                          0}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-600">Resolved %</p>
                      <p className="font-semibold">
                        {resolverResult?.resolution_rate_percent ??
                          resolverResult?.resolution_summary?.resolution_rate_percent ??
                          0}
                        %
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-600">Target (90%)</p>
                      <p className="font-semibold">
                        {(resolverResult?.target_met_90_percent ??
                          resolverResult?.resolution_summary?.target_met_90_percent)
                          ? 'Met'
                          : 'Not Met'}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-600">Target (95%)</p>
                      <p className="font-semibold">
                        {(resolverResult?.target_met_95_percent ??
                          resolverResult?.resolution_summary?.target_met_95_percent)
                          ? 'Met'
                          : 'Not Met'}
                      </p>
                    </div>
                  </div>
                  {(resolverResult?.stages || []).length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {resolverResult.stages.map((stage) => (
                        <div key={stage.name} className="rounded border border-emerald-200 bg-emerald-50/50 p-2">
                          <p className="font-medium text-gray-900">{stage.name}</p>
                          <p className="text-[10px] uppercase text-emerald-700">{stage.status}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p>
                    New timetable version:{' '}
                    <span className="font-mono">
                      {resolverResult?.version_id || resolverResult?.resolved_version_id || 'N/A'}
                    </span>
                  </p>
                  {(resolverResult?.unresolvable || []).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowUnresolvableModal(true)}
                      className="text-xs font-semibold text-red-700 underline"
                    >
                      View {resolverResult.unresolvable.length} manual resolution item(s)
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-gray-600">
                  Runs a constraint-aware issue resolver to repair conflicts and stress patterns.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showUnresolvableModal && resolverResult ? (
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
              className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Manual Resolution Required</h3>
                <p className="text-sm text-gray-600 mt-2">
                  {(resolverResult?.resolution_rate ?? 0) === 0
                    ? 'Further automatic resolution is not possible for this timetable. All conflicts require manual intervention.'
                    : `${resolverResult.unresolvable.length} conflict(s) could not be automatically resolved. Please adjust them manually in the timetable editor.`}
                </p>
              </div>
              <div className="overflow-auto p-4">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600 uppercase">
                      <th className="py-2 pr-2">Subject</th>
                      <th className="py-2 pr-2">Faculty</th>
                      <th className="py-2 pr-2">Division</th>
                      <th className="py-2 pr-2">Day/Slot</th>
                      <th className="py-2 pr-2">Session</th>
                      <th className="py-2 pr-2">Conflict</th>
                      <th className="py-2 pr-2">Reason</th>
                      <th className="py-2">Suggested Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resolverResult.unresolvable || []).map((row) => (
                      <tr key={`${row.entry_id}-${row.reason}`} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-2">{row.subject}</td>
                        <td className="py-2 pr-2">{row.faculty}</td>
                        <td className="py-2 pr-2">{row.division}</td>
                        <td className="py-2 pr-2">
                          {row.day} / {row.slot}
                        </td>
                        <td className="py-2 pr-2">{row.session_type}</td>
                        <td className="py-2 pr-2">{row.conflict_type}</td>
                        <td className="py-2 pr-2">{row.reason}</td>
                        <td className="py-2">{row.suggested_manual_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowUnresolvableModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={openManualEditForUnresolvable}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700"
                >
                  Go to Manual Edit
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
        {showRegenerateConfirm && (
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
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Regenerate Timetable?</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  ⚠️ All existing timetables will be permanently deleted
                </p>
                <p className="text-sm text-red-700">
                  When you regenerate, all previous timetable versions for this department will be immediately and permanently deleted from the system. This includes all draft and active versions.
                </p>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRegenerateConfirm(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateTimetable}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  Delete Old & Regenerate
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}