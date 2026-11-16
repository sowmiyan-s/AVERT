import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  Image as ImageIcon,
  Lock,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  resolveDownloadExtension,
  type AiEditingPolicy,
  type OutputFormatPreference,
  type ProtectionRecord,
  type ShadowQuestionType,
} from '../lib/avertProtocol';
import {
  DEFAULT_GENERAL_SHADOW_QUESTIONS,
  REFUSAL_TARGETS,
} from '../lib/paperBenchmarks';

export interface SampleDescriptor {
  id: string;
  title: string;
  category: string;
  datasetAnalogue: string;
  suggestedProbingQuestion: string;
  dimensions: string;
  preview_url: string;
}

interface ProtectWorkspaceProps {
  samples: SampleDescriptor[];
  activeProtection: ProtectionRecord | null;
  onProtectionCreated: (record: ProtectionRecord) => void;
  onNavigateToVerify: (protectionId: string) => void;
  onNavigateToEditor: (protectionId: string) => void;
  triggerFocusUploadSignal: number;
}

const POLICY_OPTIONS: {
  id: AiEditingPolicy;
  title: string;
  behavior: string;
}[] = [
  {
    id: 'deny',
    title: 'Block AI editing',
    behavior: 'Compatible editors refuse all AI editing requests',
  },
  {
    id: 'require_authorization',
    title: 'Ask owner first',
    behavior: 'Requires a single-use scoped owner authorization grant',
  },
  {
    id: 'allow',
    title: 'Allow editing',
    behavior: 'Signed provenance record with no editing restriction',
  },
];

export const ProtectWorkspace: React.FC<ProtectWorkspaceProps> = ({
  samples,
  activeProtection,
  onProtectionCreated,
  onNavigateToVerify,
  onNavigateToEditor,
  triggerFocusUploadSignal,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);

  const [selectedSampleId, setSelectedSampleId] = useState<string>('sample_portrait');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [uploadedMeta, setUploadedMeta] = useState<{
    name: string;
    size: number;
    dimensions: string;
  } | null>(null);

  const [policy, setPolicy] = useState<AiEditingPolicy>('deny');
  const [outputFormat, setOutputFormat] = useState<OutputFormatPreference>('same');
  const [expiresHours, setExpiresHours] = useState<string>('');
  const [ownerRef, setOwnerRef] = useState<string>('researcher@avert.local');

  // Experimental ImageProtector BIM perturbation parameters
  const [applyPerturbation, setApplyPerturbation] = useState<boolean>(true);
  const [epsilonOver255, setEpsilonOver255] = useState<number>(8);
  const [stepSizeAlpha, setStepSizeAlpha] = useState<number>(0.005);
  const [maxIter, setMaxIter] = useState<number>(1000);
  const [shadowType, setShadowType] = useState<ShadowQuestionType>('general');
  const [exampleQuestion, setExampleQuestion] = useState<string>(
    'Who is this person and where was this portrait captured?'
  );
  const [shadowQuestions, setShadowQuestions] = useState<string[]>(
    DEFAULT_GENERAL_SHADOW_QUESTIONS.slice(0, 10)
  );
  const [shadowSource, setShadowSource] = useState<string>('Default set');
  const [generatingQuestions, setGeneratingQuestions] = useState<boolean>(false);
  const [targetRefusal, setTargetRefusal] = useState<string>(REFUSAL_TARGETS[0]);

  const [jobState, setJobState] = useState<{
    running: boolean;
    stage: string;
    progress: number;
    error: string | null;
  }>({
    running: false,
    stage: '',
    progress: 0,
    error: null,
  });

  const [previewMode, setPreviewMode] = useState<'side_by_side' | 'diff' | 'manifest'>('side_by_side');
  const [copiedId, setCopiedId] = useState<boolean>(false);

  useEffect(() => {
    if (triggerFocusUploadSignal > 0 && uploadSectionRef.current) {
      uploadSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [triggerFocusUploadSignal]);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
    };
  }, [uploadedPreviewUrl]);

  const handleSelectFile = (file: File | undefined) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExt = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!validTypes.includes(file.type) && !validExt) {
      setJobState({
        running: false,
        stage: '',
        progress: 0,
        error: 'Unsupported file type. Upload JPEG, PNG, or WebP.',
      });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setJobState({
        running: false,
        stage: '',
        progress: 0,
        error: 'File exceeds the 12 MB upload limit.',
      });
      return;
    }
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setUploadedMeta({
        name: file.name,
        size: file.size,
        dimensions: `${img.naturalWidth} × ${img.naturalHeight}`,
      });
    };
    img.onerror = () => {
      setUploadedMeta({
        name: file.name,
        size: file.size,
        dimensions: 'Ready',
      });
    };
    img.src = url;
    setUploadedFile(file);
    setUploadedPreviewUrl(url);
    setJobState((prev) => ({ ...prev, error: null }));
  };

  const handleSelectSample = (sample: SampleDescriptor) => {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
      setUploadedPreviewUrl(null);
    }
    setUploadedFile(null);
    setUploadedMeta(null);
    setSelectedSampleId(sample.id);
    setExampleQuestion(sample.suggestedProbingQuestion);
    setJobState((prev) => ({ ...prev, error: null }));
  };

  const handleShadowTypeChange = (nextType: ShadowQuestionType) => {
    setShadowType(nextType);
    // Align optimal step size alpha with ACL 2026 Section 5.2 ablation findings
    if (nextType === 'exact') {
      setStepSizeAlpha(0.007);
      setShadowQuestions([exampleQuestion]);
      setShadowSource('Exact probing question');
    } else {
      setStepSizeAlpha(0.005);
      if (nextType === 'general') {
        setShadowQuestions(DEFAULT_GENERAL_SHADOW_QUESTIONS.slice(0, 10));
        setShadowSource('Default set');
      }
    }
  };

  const handleGenerateShadowQuestions = async () => {
    setGeneratingQuestions(true);
    try {
      const resp = await fetch('/api/v1/shadow-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: shadowType,
          example_question: exampleQuestion,
          count: shadowType === 'exact' ? 1 : 10,
        }),
      });
      const data = await resp.json();
      if (Array.isArray(data.questions)) {
        setShadowQuestions(data.questions);
        setShadowSource(
          data.source === 'gemini-4-hydrogen' ? 'Gemini 4 Hydrogen' : 'Template set'
        );
      }
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleRunProtection = async () => {
    setJobState({
      running: true,
      stage: 'Submitting image & policy job',
      progress: 10,
      error: null,
    });

    try {
      const formData = new FormData();
      if (uploadedFile) {
        formData.append('image', uploadedFile);
      } else {
        formData.append('sample_id', selectedSampleId);
      }
      formData.append('policy', policy);
      formData.append('output_format', outputFormat);
      formData.append('apply_perturbation', String(applyPerturbation));
      formData.append('epsilon_over_255', String(epsilonOver255));
      formData.append('step_size_alpha', String(stepSizeAlpha));
      formData.append('max_iter', String(maxIter));
      formData.append('shadow_question_type', shadowType);
      formData.append('shadow_questions', JSON.stringify(shadowQuestions));
      formData.append('target_refusal', targetRefusal);
      if (ownerRef.trim()) {
        formData.append('owner_reference', ownerRef.trim());
      }
      if (expiresHours) {
        formData.append('expires_hours', expiresHours);
      }

      const startResp = await fetch('/api/v1/protections', {
        method: 'POST',
        body: formData,
      });
      const startText = await startResp.text();
      let startData: { job_id?: string; error?: string };
      try {
        startData = JSON.parse(startText);
      } catch {
        throw new Error('Server returned an invalid response.');
      }
      if (!startResp.ok || !startData.job_id) {
        throw new Error(startData.error || 'Failed to start protection job');
      }

      const jobId = startData.job_id;

      // Poll backend job status with generous timeout for large images
      let completedProtectionId: string | null = null;
      for (let attempt = 0; attempt < 180; attempt++) {
        const jobResp = await fetch(`/api/v1/jobs/${jobId}`);
        if (!jobResp.ok) {
          throw new Error('Job status unavailable. Please try again.');
        }
        const jobData = await jobResp.json();
        setJobState({
          running: jobData.status !== 'completed' && jobData.status !== 'failed',
          stage: jobData.stage || 'Processing',
          progress: jobData.progress ?? 30,
          error: jobData.status === 'failed' ? jobData.error || 'Job failed' : null,
        });

        if (jobData.status === 'completed' && jobData.protection_id) {
          completedProtectionId = jobData.protection_id;
          break;
        }
        if (jobData.status === 'failed') {
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!completedProtectionId) {
        throw new Error('Protection job timed out. Please try again.');
      }

      const recResp = await fetch(`/api/v1/protections/${completedProtectionId}`);
      const recData = await recResp.json();
      if (!recResp.ok || !recData.protection_id) {
        throw new Error(recData.error || 'Failed to load protected output');
      }
      onProtectionCreated(recData as ProtectionRecord);
    } catch (err) {
      setJobState({
        running: false,
        stage: '',
        progress: 0,
        error: err instanceof Error ? err.message : 'Protection failed',
      });
    }
  };

  const activeSample = samples.find((s) => s.id === selectedSampleId) ?? samples[0];
  const currentPreviewSrc = uploadedPreviewUrl ?? activeSample?.preview_url ?? '';

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Protect Image
        </h1>
        {activeProtection && (
          <button
            type="button"
            onClick={() => onNavigateToVerify(activeProtection.protection_id)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            Verify Active Credential
          </button>
        )}
      </div>

      {/* Main Split Configuration & Output Workbench */}
      <div ref={uploadSectionRef} className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Upload, Policy, and Experimental Perturbation Controls */}
        <div className="space-y-6 lg:col-span-5">
          {/* Step 1: Image Input */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900">
                1. Source Image
              </h2>
              <span className="font-mono text-xs text-slate-500 whitespace-nowrap">
                JPEG · PNG · WebP · Max 12 MB
              </span>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleSelectFile(e.dataTransfer.files?.[0]);
              }}
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-center transition-colors hover:border-[#1D4ED8]"
            >
              <Upload className="mb-2 h-5 w-5 text-slate-500" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-800">
                Drop an image here or browse from disk
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                EXIF stripped on export
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload image file"
                className="sr-only"
                onChange={(e) => {
                  handleSelectFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                Browse files
              </button>
            </div>

            {uploadedMeta ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{uploadedMeta.name}</p>
                  <p className="font-mono text-slate-500 tabular-nums">
                    {uploadedMeta.dimensions} · {(uploadedMeta.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
                    setUploadedFile(null);
                    setUploadedPreviewUrl(null);
                    setUploadedMeta(null);
                  }}
                  className="ml-3 text-xs font-medium text-[#1D4ED8] hover:underline cursor-pointer shrink-0"
                >
                  Use sample instead
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">
                  Or choose a sample:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {samples.map((sample) => {
                    const selected = !uploadedFile && selectedSampleId === sample.id;
                    return (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => handleSelectSample(sample)}
                        className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'border-[#1D4ED8] bg-blue-50/40 ring-1 ring-[#1D4ED8]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <img
                          src={sample.preview_url}
                          alt={sample.title}
                          referrerPolicy="no-referrer"
                          className="h-16 w-full object-cover"
                        />
                        <div className="p-2">
                          <p className="truncate text-xs font-medium text-slate-900">
                            {sample.title}
                          </p>
                          <p className="truncate font-mono text-[11px] text-slate-500">
                            {sample.category}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Step 2: Cooperative Editing Policy */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              2. Editing Policy & Export
            </h2>

            <div className="space-y-2" role="radiogroup" aria-label="AI editing policy">
              {POLICY_OPTIONS.map((opt) => {
                const active = policy === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      active
                        ? 'border-[#1D4ED8] bg-blue-50/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ai_editing_policy"
                      value={opt.id}
                      checked={active}
                      onChange={() => setPolicy(opt.id)}
                      className="mt-0.5 accent-[#1D4ED8]"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{opt.title}</p>
                      <p className="text-xs text-slate-600">{opt.behavior}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="output-format"
                  className="block text-xs font-medium text-slate-700"
                >
                  Output format
                </label>
                <select
                  id="output-format"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as OutputFormatPreference)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                >
                  <option value="same">
                    Same as uploaded (
                    {uploadedFile
                      ? uploadedFile.type === 'image/jpeg'
                        ? 'JPEG'
                        : uploadedFile.type === 'image/webp'
                          ? 'WebP'
                          : 'PNG'
                      : 'PNG'}
                    )
                  </option>
                  <option value="png">PNG (Lossless)</option>
                  <option value="webp">WebP (Q=95)</option>
                  <option value="jpeg">JPEG (Q=95)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="credential-expiry"
                  className="block text-xs font-medium text-slate-700"
                >
                  Credential expiry
                </label>
                <select
                  id="credential-expiry"
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                >
                  <option value="">No expiry</option>
                  <option value="24">24 hours</option>
                  <option value="168">7 days</option>
                  <option value="720">30 days</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="owner-ref"
                  className="block text-xs font-medium text-slate-700"
                >
                  Owner reference
                </label>
                <input
                  id="owner-ref"
                  type="text"
                  value={ownerRef}
                  onChange={(e) => setOwnerRef(e.target.value)}
                  placeholder="Optional ID or email"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
          </section>

          {/* Step 3: Experimental ImageProtector Perturbation */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  3. Adversarial Perturbation
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Bounded ℓ∞ pixel perturbation
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyPerturbation}
                  onChange={(e) => setApplyPerturbation(e.target.checked)}
                  className="h-4 w-4 accent-[#1D4ED8]"
                />
                Enable
              </label>
            </div>

            {applyPerturbation && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="epsilon-select"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Bound ε (ℓ∞)
                    </label>
                    <select
                      id="epsilon-select"
                      value={epsilonOver255}
                      onChange={(e) => setEpsilonOver255(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
                    >
                      <option value={4}>4 / 255 (Subtle)</option>
                      <option value={8}>8 / 255 (Recommended)</option>
                      <option value={12}>12 / 255 (Stronger)</option>
                      <option value={16}>16 / 255 (Max)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="alpha-input"
                      className="block text-xs font-medium text-slate-700"
                    >
                      BIM Step α
                    </label>
                    <select
                      id="alpha-input"
                      value={stepSizeAlpha}
                      onChange={(e) => setStepSizeAlpha(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
                    >
                      <option value={0.004}>0.004</option>
                      <option value={0.005}>0.005 (General/Sim.)</option>
                      <option value={0.007}>0.007 (Exact)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="iter-select"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Max iterations
                    </label>
                    <select
                      id="iter-select"
                      value={maxIter}
                      onChange={(e) => setMaxIter(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
                    >
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                      <option value={1500}>1500 (Peak)</option>
                    </select>
                  </div>
                </div>

                {/* Shadow Questions Profile */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">
                      Shadow question strategy
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {shadowSource}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                    {(['exact', 'similar', 'general'] as ShadowQuestionType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleShadowTypeChange(t)}
                        className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer ${
                          shadowType === t
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {(shadowType === 'exact' || shadowType === 'similar') && (
                    <div>
                      <label
                        htmlFor="example-probing-question"
                        className="block text-xs font-medium text-slate-700"
                      >
                        {shadowType === 'exact'
                          ? 'Exact anticipated probing question'
                          : 'Seed example question to rephrase'}
                      </label>
                      <input
                        id="example-probing-question"
                        type="text"
                        value={exampleQuestion}
                        onChange={(e) => {
                          setExampleQuestion(e.target.value);
                          if (shadowType === 'exact') {
                            setShadowQuestions([e.target.value]);
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                      />
                    </div>
                  )}

                  {shadowType !== 'exact' && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500 tabular-nums">
                        {shadowQuestions.length} shadow questions active
                      </p>
                      <button
                        type="button"
                        disabled={generatingQuestions}
                        onClick={handleGenerateShadowQuestions}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                        {generatingQuestions ? 'Generating...' : 'Regenerate with Gemini'}
                      </button>
                    </div>
                  )}

                  <div className="max-h-24 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700">
                    {shadowQuestions.map((q, idx) => (
                      <div key={idx} className="truncate">
                        {idx + 1}. {q}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="target-refusal"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Refusal target phrase
                  </label>
                  <select
                    id="target-refusal"
                    value={targetRefusal}
                    onChange={(e) => setTargetRefusal(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    {REFUSAL_TARGETS.map((r, i) => (
                      <option key={i} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={jobState.running}
                onClick={handleRunProtection}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-60 cursor-pointer"
              >
                {jobState.running ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    Protect Image & Sign Manifest
                  </>
                )}
              </button>

              {jobState.running && (
                <div className="mt-3 space-y-1.5" aria-live="polite">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>{jobState.stage}</span>
                    <span className="font-mono tabular-nums">{jobState.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-[#1D4ED8] transition-all duration-150"
                      style={{ width: `${jobState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {jobState.error && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{jobState.error}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Visual Preview, Quality Metrics, Perturbation Residual, and Export */}
        <div className="space-y-6 lg:col-span-7 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Visual & Cryptographic Output
                </h2>
                <p className="font-mono text-xs text-slate-500">
                  {activeProtection
                    ? `${activeProtection.protection_id} · ${activeProtection.output_format.toUpperCase()} · ${activeProtection.quality.width}×${activeProtection.quality.height}`
                    : 'Previewing input source prior to protection'}
                </p>
              </div>

              {activeProtection && (
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('side_by_side')}
                    className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                      previewMode === 'side_by_side'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Original vs. Protected
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('diff')}
                    className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                      previewMode === 'diff'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    18× Perturbation Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('manifest')}
                    className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                      previewMode === 'manifest'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Signed Manifest
                  </button>
                </div>
              )}
            </div>

            {!activeProtection ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6">
                {currentPreviewSrc ? (
                  <img
                    src={currentPreviewSrc}
                    alt="Selected source preview"
                    referrerPolicy="no-referrer"
                    className="max-h-[340px] rounded-lg border border-slate-200 object-contain"
                  />
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                    <ImageIcon className="mb-2 h-8 w-8" aria-hidden="true" />
                    <p className="text-sm">Select a sample or upload an image</p>
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Select an image and click Protect Image & Sign Manifest.
                </p>
              </div>
            ) : previewMode === 'side_by_side' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <figure className="space-y-2">
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      src={activeProtection.original_url}
                      alt="Original unperturbed image"
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-full object-contain"
                    />
                  </div>
                  <figcaption className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">Original Source</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      SHA-256: {activeProtection.original_sha256.slice(0, 12)}…
                    </span>
                  </figcaption>
                </figure>

                <figure className="space-y-2">
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img
                      src={activeProtection.image_url}
                      alt="Protected derivative image"
                      referrerPolicy="no-referrer"
                      className="aspect-[4/3] w-full object-contain"
                    />
                  </div>
                  <figcaption className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-900">Protected Derivative</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      SHA-256: {activeProtection.protected_sha256.slice(0, 12)}…
                    </span>
                  </figcaption>
                </figure>
              </div>
            ) : previewMode === 'diff' ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-3">
                  <img
                    src={activeProtection.diff_url}
                    alt="18x amplified pixel perturbation residual map"
                    referrerPolicy="no-referrer"
                    className="mx-auto max-h-[340px] object-contain"
                  />
                </div>
                <p className="text-xs text-slate-600">
                  Visualization of |x_protected − x_original| amplified 18× per RGB channel. Peak
                  channel delta measured at{' '}
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {activeProtection.quality.l_inf_max_delta}/255
                  </span>
                  .
                </p>
              </div>
            ) : (
              <pre className="max-h-[360px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
                {JSON.stringify(activeProtection.manifest, null, 2)}
              </pre>
            )}

            {/* Measured Quality & Cryptographic Metrics */}
            {activeProtection && (
              <>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      PSNR
                    </p>
                    <p className="mt-0.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      {activeProtection.quality.psnr_db.toFixed(2)}
                      <span className="ml-1 text-xs font-normal text-slate-500">dB</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      SSIM
                    </p>
                    <p className="mt-0.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      {activeProtection.quality.ssim.toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Max |δ|∞
                    </p>
                    <p className="mt-0.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      {activeProtection.quality.l_inf_max_delta}
                      <span className="ml-1.5 text-xs font-normal text-slate-500">/ 255</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Ed25519 Status
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Signed
                    </p>
                  </div>
                </div>

                {/* Export & Handoff Actions */}
                <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                  <a
                    href={`${activeProtection.image_url}?download=1`}
                    download={`${activeProtection.sample_or_filename.replace(/\.[^.]+$/, '')}_avert_protected.${resolveDownloadExtension(activeProtection.output_format, activeProtection.sample_or_filename)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Download {activeProtection.output_format.toUpperCase()}
                  </a>
                  <a
                    href={`${activeProtection.manifest_url}?download=1`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Download Manifest JSON
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeProtection.protection_id);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 1800);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {copiedId ? 'Copied ID' : `ID: ${activeProtection.protection_id}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToVerify(activeProtection.protection_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-blue-50/60 px-3.5 py-2 text-xs font-medium text-[#1D4ED8] hover:bg-blue-50 cursor-pointer"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Test in Verifier
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToEditor(activeProtection.protection_id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Test in Compatible Editor
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
