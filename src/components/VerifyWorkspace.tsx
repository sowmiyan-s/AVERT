import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileWarning,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type {
  AuditEventRecord,
  AuthorizationGrant,
  ProtectionRecord,
  VerificationResult,
} from '../lib/avertProtocol';

interface VerifyWorkspaceProps {
  protections: ProtectionRecord[];
  selectedProtectionId: string | null;
  onSelectProtectionId: (id: string) => void;
  onRefreshProtections: () => void;
}

export const VerifyWorkspace: React.FC<VerifyWorkspaceProps> = ({
  protections,
  selectedProtectionId,
  onSelectProtectionId,
  onRefreshProtections,
}) => {
  const [verification, setVerification] = useState<
    (VerificationResult & { computed_image_sha256?: string; simulation_note?: string }) | null
  >(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [issuedGrant, setIssuedGrant] = useState<AuthorizationGrant | null>(null);
  const [publicKeyPem, setPublicKeyPem] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);

  // Manual file verification inputs
  const [manualImageFile, setManualImageFile] = useState<File | null>(null);
  const [manualManifestText, setManualManifestText] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);

  const activeRecord =
    protections.find((p) => p.protection_id === selectedProtectionId) ?? protections[0] ?? null;

  useEffect(() => {
    fetch('/api/v1/keys/public')
      .then((r) => r.json())
      .then((d) => setPublicKeyPem(d.public_key_pem || ''))
      .catch(() => {});
  }, []);

  const runVerifyForRecord = async (protectionId: string) => {
    setVerifying(true);
    setManualError(null);
    try {
      const resp = await fetch('/api/v1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protection_id: protectionId }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.checks) {
        setManualError(data?.error || 'Verification failed.');
      } else {
        setVerification(data);
      }
      const auditResp = await fetch(`/api/v1/audit/${protectionId}`);
      if (auditResp.ok) {
        const auditData = await auditResp.json();
        setAuditEvents(auditData.events ?? []);
      }
    } catch {
      setManualError('Failed to contact verification service.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (activeRecord) {
      void runVerifyForRecord(activeRecord.protection_id);
      setManualManifestText(JSON.stringify(activeRecord.manifest, null, 2));
    }
  }, [activeRecord?.protection_id]);

  const handleSimulateTamper = async (mode: 'recompress_jpeg' | 'tamper_manifest_policy') => {
    if (!activeRecord) return;
    setVerifying(true);
    setManualError(null);
    try {
      const resp = await fetch('/api/v1/verify/simulate-tamper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protection_id: activeRecord.protection_id,
          mode,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.checks) {
        setManualError(data?.error || 'Tamper simulation failed.');
      } else {
        setVerification(data);
      }
      const auditResp = await fetch(`/api/v1/audit/${activeRecord.protection_id}`);
      if (auditResp.ok) {
        const auditData = await auditResp.json();
        setAuditEvents(auditData.events ?? []);
      }
    } catch {
      setManualError('Failed to run tamper simulation.');
    } finally {
      setVerifying(false);
    }
  };

  const handleIssueGrant = async () => {
    if (!activeRecord) return;
    setManualError(null);
    try {
      const resp = await fetch('/api/v1/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protection_id: activeRecord.protection_id,
          permitted_operation: 'single_authorized_edit',
          ttl_minutes: 15,
        }),
      });
      const grant = await resp.json();
      if (resp.ok) {
        setIssuedGrant(grant);
        const auditResp = await fetch(`/api/v1/audit/${activeRecord.protection_id}`);
        if (auditResp.ok) {
          const auditData = await auditResp.json();
          setAuditEvents(auditData.events ?? []);
        }
      } else {
        setManualError(grant?.error || 'Failed to issue authorization grant.');
      }
    } catch {
      setManualError('Failed to issue authorization grant.');
    }
  };

  const handleRevoke = async () => {
    if (!activeRecord) return;
    setManualError(null);
    try {
      const resp = await fetch(`/api/v1/revoke/${activeRecord.protection_id}`, { method: 'POST' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setManualError(data?.error || 'Failed to revoke credential.');
        return;
      }
      onRefreshProtections();
      await runVerifyForRecord(activeRecord.protection_id);
    } catch {
      setManualError('Failed to revoke credential.');
    }
  };

  const handleManualFileVerify = async () => {
    setManualError(null);
    if (!manualImageFile && !manualManifestText.trim()) {
      setManualError('Provide an image file and/or manifest JSON to verify.');
      return;
    }
    setVerifying(true);
    try {
      const formData = new FormData();
      if (manualImageFile) {
        formData.append('image', manualImageFile);
      }
      if (manualManifestText.trim()) {
        // Validate JSON before sending
        JSON.parse(manualManifestText);
        formData.append('manifest', manualManifestText.trim());
      }
      const resp = await fetch('/api/v1/verify', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || !data?.checks) {
        setManualError(data?.error || 'Verification failed');
      } else {
        setVerification(data);
      }
    } catch {
      setManualError('Manifest text is not valid JSON.');
    } finally {
      setVerifying(false);
    }
  };

  const statusMeta = (() => {
    switch (verification?.status) {
      case 'valid_prohibited':
        return {
          title: 'Valid credential — editing prohibited',
          tone: 'border-red-200 bg-red-50 text-red-900',
          icon: <Ban className="h-5 w-5 text-red-700" aria-hidden="true" />,
        };
      case 'valid_authorization_required':
        return {
          title: 'Valid credential — owner authorization required',
          tone: 'border-amber-200 bg-amber-50 text-amber-900',
          icon: <KeyRound className="h-5 w-5 text-amber-700" aria-hidden="true" />,
        };
      case 'valid_allowed':
        return {
          title: 'Valid credential — editing allowed',
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
          icon: <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />,
        };
      case 'invalid_signature':
        return {
          title: 'Invalid signature',
          tone: 'border-red-200 bg-red-50 text-red-900',
          icon: <ShieldAlert className="h-5 w-5 text-red-700" aria-hidden="true" />,
        };
      case 'image_mismatch':
        return {
          title: 'Image does not match manifest',
          tone: 'border-amber-200 bg-amber-50 text-amber-900',
          icon: <FileWarning className="h-5 w-5 text-amber-700" aria-hidden="true" />,
        };
      case 'expired_or_revoked':
        return {
          title: 'Credential expired or revoked',
          tone: 'border-red-200 bg-red-50 text-red-900',
          icon: <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden="true" />,
        };
      default:
        return {
          title: 'No supported credential found',
          tone: 'border-slate-200 bg-slate-100 text-slate-800',
          icon: <FileWarning className="h-5 w-5 text-slate-600" aria-hidden="true" />,
        };
    }
  })();

  return (
    <div className="mx-auto max-w-[1280px] space-y-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Verify Image & Manifest
        </h1>

        <div className="flex items-center gap-2">
          <label htmlFor="protection-select" className="text-xs font-medium text-slate-700">
            Active record:
          </label>
          <select
            id="protection-select"
            value={activeRecord?.protection_id ?? ''}
            onChange={(e) => onSelectProtectionId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900"
          >
            {protections.map((p) => (
              <option key={p.protection_id} value={p.protection_id}>
                {p.protection_id} ({p.policy}{p.revoked ? ', REVOKED' : ''})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Verdict Banner */}
      {verification && (
        <section
          aria-live="polite"
          className={`rounded-xl border p-5 ${statusMeta.tone}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{statusMeta.icon}</div>
              <div>
                <h2 className="font-display text-lg font-semibold">{statusMeta.title}</h2>
                <p className="mt-1 text-sm opacity-90">{verification.message}</p>
                {verification.simulation_note && (
                  <p className="mt-2 font-mono text-xs underline underline-offset-2">
                    Simulation: {verification.simulation_note}
                  </p>
                )}
              </div>
            </div>

            {activeRecord && (
              <button
                type="button"
                disabled={verifying}
                onClick={() => runVerifyForRecord(activeRecord.protection_id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} aria-hidden="true" />
                Re-verify exact asset
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-current/15 pt-4 text-xs sm:grid-cols-5">
            <div>
              <span className="opacity-75">Ed25519 Signature</span>
              <p className="mt-0.5 font-mono font-semibold">
                {verification.checks.signature_valid ? 'PASS' : 'FAIL'}
              </p>
            </div>
            <div>
              <span className="opacity-75">SHA-256 Binding</span>
              <p className="mt-0.5 font-mono font-semibold">
                {verification.checks.digest_matches ? 'EXACT MATCH' : 'MISMATCH'}
              </p>
            </div>
            <div>
              <span className="opacity-75">Expiry Check</span>
              <p className="mt-0.5 font-mono font-semibold">
                {verification.checks.not_expired ? 'VALID' : 'EXPIRED'}
              </p>
            </div>
            <div>
              <span className="opacity-75">Revocation Check</span>
              <p className="mt-0.5 font-mono font-semibold">
                {verification.checks.not_revoked ? 'ACTIVE' : 'REVOKED'}
              </p>
            </div>
            <div>
              <span className="opacity-75">Reason Code</span>
              <p className="mt-0.5 truncate font-mono font-semibold">
                {verification.reason_code}
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: Tamper Tests, Owner Controls, and Manual File Verifier */}
        <div className="space-y-6 lg:col-span-6">
          {activeRecord && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Tamper Tests & Owner Controls
              </h2>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleSimulateTamper('recompress_jpeg')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Simulate JPEG Recompression
                  <span className="mt-0.5 block font-normal text-slate-500">
                    Breaks exact SHA-256 byte binding
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateTamper('tamper_manifest_policy')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Simulate Manifest Policy Tamper
                  <span className="mt-0.5 block font-normal text-slate-500">
                    Alters policy to allow; invalidates Ed25519
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={activeRecord.revoked}
                  onClick={handleIssueGrant}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E40AF] disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Issue Single-Use Owner Grant
                </button>
                <button
                  type="button"
                  disabled={activeRecord.revoked}
                  onClick={handleRevoke}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  {activeRecord.revoked ? 'Credential Revoked' : 'Revoke Credential'}
                </button>
              </div>

              {issuedGrant && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    Single-Use Authorization Grant Issued
                  </div>
                  <p className="mt-1 font-mono">
                    Grant ID: <span className="font-semibold">{issuedGrant.grant_id}</span>
                  </p>
                  <p className="mt-0.5 text-emerald-800">
                    Single-use token. Paste into Editor Lab to authorize one edit.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Manual Upload Verifier */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Independent File + Manifest Verification
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Upload protected image file (optional if testing manifest only)
                </label>
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100">
                  <Upload className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span>{manualImageFile ? manualImageFile.name : 'Choose PNG / JPEG / WebP file'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => setManualImageFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <div>
                <label
                  htmlFor="manual-manifest-json"
                  className="block text-xs font-medium text-slate-700"
                >
                  Sidecar Manifest JSON (org.avert.manifest.v1)
                </label>
                <textarea
                  id="manual-manifest-json"
                  rows={7}
                  value={manualManifestText}
                  onChange={(e) => setManualManifestText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-900"
                />
              </div>

              {manualError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {manualError}
                </p>
              )}

              <button
                type="button"
                onClick={handleManualFileVerify}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
              >
                Verify Uploaded Bytes & Manifest
              </button>
            </div>
          </section>
        </div>

        {/* Right: Audit Log & Verifier Public Key */}
        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Verification & Enforcement Audit Trail
              </h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {auditEvents.length} events
              </span>
            </div>

            {auditEvents.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No audit events recorded for this protection record yet.
              </p>
            ) : (
              <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto">
                {auditEvents.map((evt) => (
                  <div key={evt.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900">
                        {evt.event_type} · {evt.decision.toUpperCase()}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {new Date(evt.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{evt.details}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Verifier Public Key (Ed25519)
            </h2>
            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
              {publicKeyPem || 'Loading public key...'}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
};
