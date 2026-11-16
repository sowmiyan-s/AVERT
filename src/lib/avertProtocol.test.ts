import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRefusalJudgePrompt,
  canonicalSerialize,
  computeImageQualityMetrics,
  evaluateRefusalHeuristic,
  evaluateVerificationState,
  extractSignableManifest,
  resolveDownloadExtension,
  resolveOutputFormat,
  type AvertManifest,
} from './avertProtocol';

function makeValidManifest(
  policy: 'deny' | 'require_authorization' | 'allow' = 'deny',
  expiresAt: string | null = null
): AvertManifest {
  return {
    schema: 'org.avert.manifest.v1',
    protection_id: 'avert_test_001',
    issuer: 'avert.local',
    owner_reference: 'researcher@lab.org',
    created_at: '2026-11-15T12:00:00.000Z',
    expires_at: expiresAt,
    policy: {
      ai_editing: policy,
    },
    asset_binding: {
      algorithm: 'sha256',
      digest: 'a'.repeat(64),
    },
    defense: {
      profile: 'imageprotector_bim_l_inf',
      version: '1.0',
      epsilon_over_255: 8,
      step_size_alpha: 0.005,
      max_iter: 1000,
      shadow_question_type: 'general',
      shadow_question_count: 10,
      target_refusal: "I'm sorry, I can't assist with that request.",
    },
    key_id: 'avert-ed25519-key-01',
    signature: 'dummy_sig',
  };
}

test('canonicalSerialize produces deterministic output regardless of key order', () => {
  const a = { b: 2, a: { z: 1, m: [3, 4] } };
  const b = { a: { m: [3, 4], z: 1 }, b: 2 };
  assert.equal(canonicalSerialize(a), canonicalSerialize(b));
  assert.equal(canonicalSerialize(a), '{"a":{"m":[3,4],"z":1},"b":2}');
});

test('extractSignableManifest omits signature field', () => {
  const m = makeValidManifest();
  const signable = extractSignableManifest(m) as unknown as Record<string, unknown>;
  assert.equal('signature' in signable, false);
  assert.equal(signable.protection_id, 'avert_test_001');
});

test('evaluateVerificationState enforces all 6 security outcomes cleanly', () => {
  const digest = 'a'.repeat(64);
  const wrongDigest = 'b'.repeat(64);

  // 1. Missing credential
  const missing = evaluateVerificationState({
    manifest: null,
    imageSha256: digest,
    signatureValid: false,
    revoked: false,
  });
  assert.equal(missing.status, 'missing_credential');
  assert.equal(missing.decision, 'unverified');

  // 2. Invalid signature
  const badSig = evaluateVerificationState({
    manifest: makeValidManifest('deny'),
    imageSha256: digest,
    signatureValid: false,
    revoked: false,
  });
  assert.equal(badSig.status, 'invalid_signature');
  assert.equal(badSig.valid, false);

  // 3. Image mismatch (tampered or recompressed)
  const mismatch = evaluateVerificationState({
    manifest: makeValidManifest('deny'),
    imageSha256: wrongDigest,
    signatureValid: true,
    revoked: false,
  });
  assert.equal(mismatch.status, 'image_mismatch');
  assert.equal(mismatch.reason_code, 'ASSET_DIGEST_MISMATCH');

  // 4. Revoked credential
  const revoked = evaluateVerificationState({
    manifest: makeValidManifest('deny'),
    imageSha256: digest,
    signatureValid: true,
    revoked: true,
  });
  assert.equal(revoked.status, 'expired_or_revoked');
  assert.equal(revoked.reason_code, 'CREDENTIAL_REVOKED');

  // 5. Expired credential
  const expired = evaluateVerificationState({
    manifest: makeValidManifest('deny', '2025-01-01T00:00:00.000Z'),
    imageSha256: digest,
    signatureValid: true,
    revoked: false,
    nowMs: Date.parse('2026-11-15T12:00:00.000Z'),
  });
  assert.equal(expired.status, 'expired_or_revoked');
  assert.equal(expired.reason_code, 'CREDENTIAL_EXPIRED');

  // 6. Valid deny -> deterministic refuse
  const denyResult = evaluateVerificationState({
    manifest: makeValidManifest('deny'),
    imageSha256: digest,
    signatureValid: true,
    revoked: false,
  });
  assert.equal(denyResult.valid, true);
  assert.equal(denyResult.status, 'valid_prohibited');
  assert.equal(denyResult.decision, 'refuse');

  // 7. Valid require_authorization without grant vs with grant
  const authReq = evaluateVerificationState({
    manifest: makeValidManifest('require_authorization'),
    imageSha256: digest,
    signatureValid: true,
    revoked: false,
    authorizationGrantValid: false,
  });
  assert.equal(authReq.status, 'valid_authorization_required');
  assert.equal(authReq.decision, 'require_authorization');

  const authGranted = evaluateVerificationState({
    manifest: makeValidManifest('require_authorization'),
    imageSha256: digest,
    signatureValid: true,
    revoked: false,
    authorizationGrantValid: true,
  });
  assert.equal(authGranted.status, 'valid_allowed');
  assert.equal(authGranted.decision, 'allow');
});

test('computeImageQualityMetrics returns exact PSNR, SSIM, and L-inf bounds', () => {
  const orig = new Uint8Array([100, 120, 140, 200, 210, 220, 50, 60, 70, 90, 100, 110]);
  const identical = new Uint8Array(orig);
  const idMetrics = computeImageQualityMetrics(orig, identical, 2, 2, 3, 12);
  assert.equal(idMetrics.l_inf_max_delta, 0);
  assert.equal(idMetrics.ssim, 1);
  assert.equal(idMetrics.psnr_db, 99.99);

  // Apply +/- 8 perturbation (8/255)
  const perturbed = new Uint8Array([108, 112, 148, 192, 218, 212, 58, 52, 78, 82, 108, 102]);
  const pertMetrics = computeImageQualityMetrics(orig, perturbed, 2, 2, 3, 12);
  assert.equal(pertMetrics.l_inf_max_delta, 8);
  assert.ok(pertMetrics.psnr_db > 29 && pertMetrics.psnr_db < 31);
  assert.ok(pertMetrics.ssim > 0.9 && pertMetrics.ssim <= 1);
});

test('evaluateRefusalHeuristic and Figure 14 prompt align with ImageProtector', () => {
  const r1 = evaluateRefusalHeuristic("I'm sorry, I can't assist with that request.");
  assert.equal(r1.isRefusal, true);

  const r2 = evaluateRefusalHeuristic('The person is standing near a blue storefront.');
  assert.equal(r2.isRefusal, false);

  const judgePrompt = buildRefusalJudgePrompt("Unfortunately, I can't assist with that request.");
  assert.ok(judgePrompt.includes("Please respond only with 'yes' or 'no'"));
});

test('resolveOutputFormat and resolveDownloadExtension preserve uploaded format and extension', () => {
  assert.equal(resolveOutputFormat('same', 'jpeg'), 'jpeg');
  assert.equal(resolveOutputFormat('same', 'webp'), 'webp');
  assert.equal(resolveOutputFormat('same', 'png'), 'png');
  assert.equal(resolveOutputFormat('png', 'jpeg'), 'png');
  assert.equal(resolveDownloadExtension('jpeg', 'holiday.JPG'), 'jpg');
  assert.equal(resolveDownloadExtension('jpeg', 'holiday.jpeg'), 'jpeg');
  assert.equal(resolveDownloadExtension('webp', 'shot.webp'), 'webp');
  assert.equal(resolveDownloadExtension('png', 'portrait.png'), 'png');
});

