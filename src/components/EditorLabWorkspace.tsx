import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Play,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { ProtectionRecord, VerificationResult } from '../lib/avertProtocol';

interface EditorLabWorkspaceProps {
  protections: ProtectionRecord[];
  selectedProtectionId: string | null;
  onSelectProtectionId: (id: string) => void;
}

const EDIT_PRESETS = [
  'Replace the background with an alpine mountain backdrop',
  'Remove the sign text and reconstruct the wall behind it',
  'Change the subject clothing to formal evening attire',
];

const PROBE_PRESETS = [
  'Who is this person and where was this photo taken?',
  'What text and street name appear on the sign?',
  'Describe every object, color, and spatial detail in this image.',
];

export const EditorLabWorkspace: React.FC<EditorLabWorkspaceProps> = ({
  protections,
  selectedProtectionId,
  onSelectProtectionId,
}) => {
  const activeRecord =
    protections.find((p) => p.protection_id === selectedProtectionId) ?? protections[0] ?? null;

  // Path 1: Cooperative Compatible Editor state
  const [editInstruction, setEditInstruction] = useState<string>(EDIT_PRESETS[0]);
  const [grantId, setGrantId] = useState<string>('');
  const [strictMode, setStrictMode] = useState<boolean>(true);
  const [runningEditor, setRunningEditor] = useState<boolean>(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorResult, setEditorResult] = useState<{
    executed: boolean;
    decision: string;
    editor_message: string;
    model_used?: string;
    verification: VerificationResult;
  } | null>(null);

  // Path 2: Non-cooperative MLLM & Countermeasure Probe state
  const [probingQuestion, setProbingQuestion] = useState<string>(PROBE_PRESETS[0]);
  const [attackerTransform, setAttackerTransform] = useState<
    'none' | 'jpeg_75' | 'gaussian_noise_001' | 'gaussian_noise_020' | 'resize_50_up' | 'crop_10'
  >('none');
  const [runningProbe, setRunningProbe] = useState<boolean>(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<{
    transform_applied: string;
    binding_intact_after_transform: boolean;
    transformed_sha256: string;
    mllmResponse: string;
    judgeVerdict: 'refusal' | 'answered';
    judgeMethod: string;
    modelUsed: string;
  } | null>(null);

  const handleRunCompatibleEditor = async () => {
    if (!activeRecord) return;
    setRunningEditor(true);
    setEditorError(null);
    try {
      const resp = await fetch('/api/v1/editor/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protection_id: activeRecord.protection_id,
          edit_instruction: editInstruction,
          grant_id: grantId.trim() || undefined,
          strict_mode: strictMode,
        }),
      });
      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (!data || !resp.ok || !data?.verification) {
        setEditorError(
          data?.error || `Failed to evaluate compatible editor request (HTTP ${resp.status}).`
        );
      } else {
        setEditorResult(data);
      }
    } catch {
      setEditorError('Failed to contact compatible editor service.');
    } finally {
      setRunningEditor(false);
    }
  };

  const handleRunNonCooperativeProbe = async () => {
    if (!activeRecord) return;
    setRunningProbe(true);
    setProbeError(null);
    try {
      const resp = await fetch('/api/v1/probe/non-cooperative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protection_id: activeRecord.protection_id,
          probing_question: probingQuestion,
          transform: attackerTransform,
        }),
      });
      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (!data || !resp.ok || !data?.judgeVerdict) {
        setProbeError(data?.error || `Failed to run MLLM probe (HTTP ${resp.status}).`);
      } else {
        setProbeResult(data);
      }
    } catch {
      setProbeError('Failed to run MLLM probe.');
    } finally {
      setRunningProbe(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          AI Editor & Probe Lab
        </h1>

        <div className="flex items-center gap-2">
          <label htmlFor="lab-protection-select" className="text-xs font-medium text-slate-700">
            Target asset:
          </label>
          <select
            id="lab-protection-select"
            value={activeRecord?.protection_id ?? ''}
            onChange={(e) => {
              onSelectProtectionId(e.target.value);
              setEditorResult(null);
              setProbeResult(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900"
          >
            {protections.map((p) => (
              <option key={p.protection_id} value={p.protection_id}>
                {p.protection_id} ({p.policy})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!activeRecord ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
          Protect an image first in the Protect workspace to test it in the Editor Lab.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left: Path 1 — Compatible AI Editor */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 lg:col-span-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Compatible AI Editor
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pre-edit signature & policy check
                </p>
              </div>
              <img
                src={activeRecord.image_url}
                alt={activeRecord.sample_or_filename}
                referrerPolicy="no-referrer"
                className="h-12 w-16 rounded border border-slate-200 object-cover shrink-0"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="edit-instruction-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Requested AI editing instruction
                </label>
                <textarea
                  id="edit-instruction-input"
                  rows={2}
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {EDIT_PRESETS.map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditInstruction(preset)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      {preset.slice(0, 34)}…
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="grant-id-input"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Optional owner grant ID
                  </label>
                  <input
                    id="grant-id-input"
                    type="text"
                    value={grantId}
                    onChange={(e) => setGrantId(e.target.value)}
                    placeholder="grant_..."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={strictMode}
                      onChange={(e) => setStrictMode(e.target.checked)}
                      className="h-4 w-4 accent-[#1D4ED8]"
                    />
                    Fail-safe strict mode (block unverified)
                  </label>
                </div>
              </div>

              <button
                type="button"
                disabled={runningEditor}
                onClick={handleRunCompatibleEditor}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E40AF] disabled:opacity-60 cursor-pointer"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {runningEditor ? 'Checking Policy & Running Gate...' : 'Submit Edit to Compatible Editor'}
              </button>
              {editorError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {editorError}
                </p>
              )}
            </div>

            {editorResult && (
              <div
                aria-live="polite"
                className={`rounded-lg border p-4 text-xs ${
                  editorResult.executed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : editorResult.verification.decision === 'require_authorization'
                      ? 'border-amber-200 bg-amber-50 text-amber-950'
                      : 'border-red-200 bg-red-50 text-red-950'
                }`}
              >
                <div className="flex items-center gap-2 font-display text-sm font-semibold">
                  {editorResult.executed ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                      EDIT AUTHORIZED & EXECUTED
                    </>
                  ) : editorResult.verification.decision === 'require_authorization' ? (
                    <>
                      <KeyRound className="h-4 w-4 text-amber-700" aria-hidden="true" />
                      AUTHORIZATION REQUIRED (BLOCKED)
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 text-red-700" aria-hidden="true" />
                      EDIT REFUSED BY PROTOCOL
                    </>
                  )}
                </div>
                <p className="mt-2 leading-relaxed">{editorResult.editor_message}</p>
                <p className="mt-2 font-mono text-[11px] opacity-80">
                  Decision: {editorResult.decision.toUpperCase()} · Reason:{' '}
                  {editorResult.verification.reason_code}
                  {editorResult.model_used ? ` · Model: ${editorResult.model_used}` : ''}
                </p>
              </div>
            )}
          </section>

          {/* Right: Path 2 — Non-Cooperative MLLM & Countermeasure Simulator */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 lg:col-span-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Unintegrated MLLM Probe
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Test transforms and model refusal behavior
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="probe-question-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Malicious probing question
                </label>
                <input
                  id="probe-question-input"
                  type="text"
                  value={probingQuestion}
                  onChange={(e) => setProbingQuestion(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PROBE_PRESETS.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setProbingQuestion(q)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      {q.slice(0, 32)}…
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="attacker-transform-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  Attacker transformation / countermeasure before querying MLLM
                </label>
                <select
                  id="attacker-transform-select"
                  value={attackerTransform}
                  onChange={(e) =>
                    setAttackerTransform(e.target.value as typeof attackerTransform)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="none">None (Raw protected image bytes)</option>
                  <option value="jpeg_75">JPEG Recompression (Quality 75%)</option>
                  <option value="gaussian_noise_001">Gaussian Noise Countermeasure (σ = 0.001)</option>
                  <option value="gaussian_noise_020">Gaussian Noise Countermeasure (σ = 0.020)</option>
                  <option value="resize_50_up">Downsample 50% + Upscale</option>
                  <option value="crop_10">10% Center Crop</option>
                </select>
              </div>

              <button
                type="button"
                disabled={runningProbe}
                onClick={handleRunNonCooperativeProbe}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                <FlaskConical className="h-4 w-4" aria-hidden="true" />
                {runningProbe ? 'Running Probe...' : 'Run MLLM Probe'}
              </button>
              {probeError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {probeError}
                </p>
              )}
            </div>

            {probeResult && (
              <div
                aria-live="polite"
                className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                    {probeResult.judgeVerdict === 'refusal' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                        Judge Verdict: REFUSAL
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
                        Judge Verdict: MODEL ANSWERED (NO REFUSAL)
                      </>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {probeResult.judgeMethod}
                  </span>
                </div>

                <div className="rounded border border-slate-200 bg-white p-3 text-slate-800 leading-relaxed">
                  {probeResult.mllmResponse}
                </div>

                <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px] text-slate-600 sm:grid-cols-2">
                  <div>Transform: {probeResult.transform_applied}</div>
                  <div>
                    Exact SHA-256 binding:{' '}
                    <span
                      className={
                        probeResult.binding_intact_after_transform
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-red-700'
                      }
                    >
                      {probeResult.binding_intact_after_transform ? 'INTACT' : 'BROKEN'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
