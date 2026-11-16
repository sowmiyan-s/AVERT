import crypto from 'node:crypto';
import {
  canonicalSerialize,
  extractSignableManifest,
  type AuditEventRecord,
  type AuthorizationGrant,
  type AvertManifest,
  type AvertManifestUnsigned,
  type ProtectionRecord,
} from '../src/lib/avertProtocol.js';

const KEY_ID = 'avert-ed25519-key-01';

// Generate ephemeral or deterministic dev Ed25519 keypair strictly on the server.
// Private key never leaves the server process.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

export interface StoredProtectionAssets {
  record: ProtectionRecord;
  originalBuffer: Buffer;
  protectedBuffer: Buffer;
  diffBuffer: Buffer;
}

const protectionsStore = new Map<string, StoredProtectionAssets>();
const jobsStore = new Map<
  string,
  {
    job_id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    stage: string;
    progress: number;
    protection_id: string | null;
    error: string | null;
    created_at: string;
    completed_at: string | null;
  }
>();
const grantsStore = new Map<string, AuthorizationGrant>();
const auditEventsStore = new Map<string, AuditEventRecord[]>();

export function getPublicKeyInfo() {
  return {
    key_id: KEY_ID,
    algorithm: 'Ed25519',
    public_key_pem: publicKeyPem,
  };
}

export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function signManifest(unsigned: AvertManifestUnsigned): AvertManifest {
  const canonicalBytes = Buffer.from(canonicalSerialize(unsigned), 'utf8');
  const signature = crypto.sign(null, canonicalBytes, privateKey).toString('base64');
  return {
    ...unsigned,
    signature,
  };
}

export function verifyManifestSignature(manifest: AvertManifest): boolean {
  try {
    if (!manifest || !manifest.signature || manifest.key_id !== KEY_ID) {
      return false;
    }
    const unsigned = extractSignableManifest(manifest);
    const canonicalBytes = Buffer.from(canonicalSerialize(unsigned), 'utf8');
    const sigBuffer = Buffer.from(manifest.signature, 'base64');
    return crypto.verify(null, canonicalBytes, publicKey, sigBuffer);
  } catch {
    return false;
  }
}

export function saveProtection(assets: StoredProtectionAssets) {
  protectionsStore.set(assets.record.protection_id, assets);
}

export function getProtection(protectionId: string): StoredProtectionAssets | undefined {
  return protectionsStore.get(protectionId);
}

export function listProtections(): ProtectionRecord[] {
  return Array.from(protectionsStore.values())
    .map((item) => item.record)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function revokeProtection(protectionId: string): ProtectionRecord | null {
  const entry = protectionsStore.get(protectionId);
  if (!entry) return null;
  const now = new Date().toISOString();
  entry.record.revoked = true;
  entry.record.revoked_at = now;
  recordAuditEvent({
    protection_id: protectionId,
    event_type: 'credential_revoked',
    decision: 'revoked',
    reason_code: 'OWNER_REVOKED_CREDENTIAL',
    details: 'Image owner explicitly revoked this protection manifest.',
  });
  return entry.record;
}

export function createJob(jobId: string) {
  const job = {
    job_id: jobId,
    status: 'queued' as const,
    stage: 'Validating uploaded image',
    progress: 10,
    protection_id: null,
    error: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  jobsStore.set(jobId, job);
  return job;
}

export function updateJob(
  jobId: string,
  patch: Partial<{
    status: 'queued' | 'processing' | 'completed' | 'failed';
    stage: string;
    progress: number;
    protection_id: string | null;
    error: string | null;
    completed_at: string | null;
  }>
) {
  const existing = jobsStore.get(jobId);
  if (!existing) return null;
  Object.assign(existing, patch);
  return existing;
}

export function getJob(jobId: string) {
  return jobsStore.get(jobId) ?? null;
}

export function issueAuthorizationGrant(params: {
  protectionId: string;
  assetDigest: string;
  permittedOperation: string;
  ttlMinutes?: number;
}): AuthorizationGrant {
  const ttlMs = (params.ttlMinutes ?? 15) * 60 * 1000;
  const now = Date.now();
  const grant: AuthorizationGrant = {
    grant_id: `grant_${crypto.randomBytes(6).toString('hex')}`,
    protection_id: params.protectionId,
    asset_digest: params.assetDigest,
    permitted_operation: params.permittedOperation,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMs).toISOString(),
    used: false,
    used_at: null,
  };
  grantsStore.set(grant.grant_id, grant);
  recordAuditEvent({
    protection_id: params.protectionId,
    event_type: 'authorization_issued',
    decision: 'grant_issued',
    reason_code: 'SCOPED_OWNER_GRANT',
    details: `Single-use grant ${grant.grant_id} issued for "${params.permittedOperation}" (expires ${grant.expires_at}).`,
  });
  return grant;
}

export function validateAndConsumeGrant(params: {
  grantId: string | undefined;
  protectionId: string;
  assetDigest: string;
  consume: boolean;
}): { valid: boolean; reason: string; grant?: AuthorizationGrant } {
  if (!params.grantId) {
    return { valid: false, reason: 'No authorization grant provided' };
  }
  const grant = grantsStore.get(params.grantId.trim());
  if (!grant) {
    return { valid: false, reason: 'Authorization grant not found' };
  }
  if (grant.protection_id !== params.protectionId) {
    return { valid: false, reason: 'Grant is bound to a different protection ID' };
  }
  if (grant.asset_digest !== params.assetDigest) {
    return { valid: false, reason: 'Grant asset digest mismatch' };
  }
  if (grant.used) {
    return { valid: false, reason: 'Authorization grant already consumed (replay blocked)' };
  }
  if (Date.now() > Date.parse(grant.expires_at)) {
    return { valid: false, reason: 'Authorization grant expired' };
  }
  if (params.consume) {
    grant.used = true;
    grant.used_at = new Date().toISOString();
    recordAuditEvent({
      protection_id: params.protectionId,
      event_type: 'authorization_consumed',
      decision: 'grant_consumed',
      reason_code: 'SINGLE_USE_GRANT_CONSUMED',
      details: `Single-use grant ${grant.grant_id} verified and marked consumed.`,
    });
  }
  return { valid: true, reason: 'Valid scoped owner authorization grant', grant };
}

export function recordAuditEvent(params: {
  protection_id: string;
  event_type: AuditEventRecord['event_type'];
  decision: string;
  reason_code: string;
  details: string;
}): AuditEventRecord {
  const event: AuditEventRecord = {
    id: `evt_${crypto.randomBytes(5).toString('hex')}`,
    protection_id: params.protection_id,
    event_type: params.event_type,
    decision: params.decision,
    reason_code: params.reason_code,
    details: params.details,
    created_at: new Date().toISOString(),
  };
  const existing = auditEventsStore.get(params.protection_id) ?? [];
  existing.unshift(event);
  auditEventsStore.set(params.protection_id, existing);
  return event;
}

export function getAuditEvents(protectionId: string): AuditEventRecord[] {
  return auditEventsStore.get(protectionId) ?? [];
}
