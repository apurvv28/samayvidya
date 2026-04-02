'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, BrainCircuit, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

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
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const stageMap = useMemo(() => {
    const map = new Map();
    (result?.stages || []).forEach((stage) => {
      map.set(stage.agent, stage);
    });
    return map;
  }, [result]);

  const handleCreateTimetable = async () => {
    try {
      setRunning(true);
      setResult(null);

      const response = await fetch(`${API_BASE_URL}/agents/create-timetable/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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

        blocks.forEach((block) => {
          if (!block.trim()) {
            return;
          }

          const parsed = parseSseEvent(block);
          if (!parsed?.data) {
            return;
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
            return;
          }

          if (parsed.event === 'result') {
            const payload = parsed.data?.result || null;
            setResult(payload);
            if (payload?.version_id && onTimetableCreated) {
              onTimetableCreated(payload.version_id);
            }
            return;
          }

          if (parsed.event === 'error') {
            throw new Error(parsed.data?.detail || 'Orchestration stream failed.');
          }
        });
      }

      showToast('Timetable created successfully.', 'success');
    } catch (error) {
      console.error('Error creating timetable from agent orchestration:', error);
      showToast(error.message || 'Orchestration failed.', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="rounded-2xl border border-cyan-500/20 bg-linear-to-br from-slate-900 via-gray-900 to-cyan-950/30 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Agent Orchestration</p>
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-cyan-300" />
              Multi-Agent Timetable Creator
            </h2>
            <p className="text-sm text-gray-300 max-w-2xl">
              Single-click orchestration through planning, allocation, constraint resolution, and optimization agents.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCreateTimetable}
            disabled={running}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900/40 disabled:text-cyan-100/60 disabled:cursor-not-allowed transition-colors"
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
            <div key={stageName} className="rounded-xl border border-white/10 bg-gray-900/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-gray-100 leading-snug">{stageName}</h3>
                {running && !hasData ? (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                ) : completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-gray-500" />
                )}
              </div>

              <p className="text-xs text-gray-400 min-h-9">
                {stage?.message || (running ? 'Running stage...' : 'Waiting for execution')}
              </p>

              {stage?.metrics ? (
                <div className="space-y-1 text-[11px] text-gray-300">
                  {Object.entries(stage.metrics).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">{key.replaceAll('_', ' ')}</span>
                      <span className="font-mono text-gray-200">{String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-gray-900/70 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-100">Final Optimized Timetable</h3>
        {!result ? (
          <p className="text-sm text-gray-400">Run orchestration to generate and persist a timetable version.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-gray-800/60 border border-white/5 p-3">
                <p className="text-gray-400">Run ID</p>
                <p className="font-mono text-gray-100 break-all">{result.run_id}</p>
              </div>
              <div className="rounded-lg bg-gray-800/60 border border-white/5 p-3">
                <p className="text-gray-400">Version ID</p>
                <p className="font-mono text-gray-100 break-all">{result.version_id || 'Not persisted'}</p>
              </div>
              <div className="rounded-lg bg-gray-800/60 border border-white/5 p-3">
                <p className="text-gray-400">Sessions</p>
                <p className="font-mono text-gray-100">
                  {result.summary?.scheduled_sessions || 0}/{result.summary?.requested_sessions || 0}
                </p>
              </div>
            </div>

            {result.version_id && onViewTimetable ? (
              <div>
                <button
                  type="button"
                  onClick={onViewTimetable}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold text-cyan-200 border border-cyan-400/40 hover:bg-cyan-500/10 transition-colors"
                >
                  Open This Version In Timetable Tab
                </button>
              </div>
            ) : null}

            <div className="text-xs text-gray-400 max-h-56 overflow-auto rounded-lg bg-black/20 border border-white/5 p-3">
              <p className="mb-2 text-gray-300">Sample scheduled entries</p>
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