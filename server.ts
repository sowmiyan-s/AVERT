import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';
import {
  evaluateVerificationState,
  resolveDownloadExtension,
  resolveOutputFormat,
  type AiEditingPolicy,
  type AvertManifest,
  type OutputFormatPreference,
  type ProtectionRecord,
  type ShadowQuestionType,
} from './src/lib/avertProtocol.js';
import {
  DEFAULT_GENERAL_SHADOW_QUESTIONS,
  REFUSAL_TARGETS,
} from './src/lib/paperBenchmarks.js';
import {
  createJob,
  getAuditEvents,
  getJob,
  getProtection,
  getPublicKeyInfo,
  issueAuthorizationGrant,
  listProtections,
  recordAuditEvent,
  revokeProtection,
  saveProtection,
  sha256Hex,
  signManifest,
  updateJob,
  validateAndConsumeGrant,
  verifyManifestSignature,
} from './server/cryptoService.js';
import {
  applyAttackerTransformation,
  applyProtectionExport,
  getSampleImageBuffer,
  SAMPLE_DESCRIPTORS,
  validateAndDecodeImage,
} from './server/imageEngine.js';
import {
  generateShadowQuestions,
  runCompatibleEditorEditAnalysis,
  runNonCooperativeMllmProbe,
} from './server/geminiService.js';

const PORT = Number(process.env.PORT ?? 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function runProtectionPipeline(params: {
  jobId: string;
  protectionId: string;
  inputBuffer: Buffer;
  filename: string;
  policy: AiEditingPolicy;
  outputFormatPreference: OutputFormatPreference;
  applyExperimentalPerturbation: boolean;
  epsilonOver255: number;
  stepSizeAlpha: number;
  maxIter: number;
  shadowQuestionType: ShadowQuestionType;
  shadowQuestions: string[];
  targetRefusal: string | null;
  ownerReference: string | null;
  expiresAt: string | null;
}) {
  const {
    jobId,
    protectionId,
    inputBuffer,
    filename,
    policy,
    outputFormatPreference,
    applyExperimentalPerturbation,
    epsilonOver255,
    stepSizeAlpha,
    maxIter,
    shadowQuestionType,
    shadowQuestions,
    targetRefusal,
    ownerReference,
    expiresAt,
  } = params;

  try {
    updateJob(jobId, {
      status: 'processing',
      stage: 'Validating file & decoding pixels',
      progress: 20,
    });

    const decoded = await validateAndDecodeImage(inputBuffer);
    const outputFormat = resolveOutputFormat(outputFormatPreference, decoded.format);
    const originalSha256 = sha256Hex(decoded.normalizedOriginalPng);

    updateJob(jobId, {
      stage: applyExperimentalPerturbation
        ? `Synthesizing BIM l-inf <= ${epsilonOver255}/255 perturbation`
        : 'Preparing clean derivative (no perturbation)',
      progress: 50,
    });

    // Brief yield so job polling reflects genuine stages without blocking
    await new Promise((r) => setTimeout(r, 120));

    const exported = await applyProtectionExport({
      originalRgb: decoded.rgbBuffer,
      width: decoded.width,
      height: decoded.height,
      outputFormat,
      applyExperimentalPerturbation,
      epsilonOver255,
      stepSizeAlpha,
      maxIter,
      shadowQuestionType,
      shadowQuestions,
    });

    updateJob(jobId, {
      stage: 'Computing SHA-256 digest & signing Ed25519 manifest',
      progress: 82,
    });

    const protectedSha256 = sha256Hex(exported.exportedBuffer);
    const keyInfo = getPublicKeyInfo();
    const createdAt = new Date().toISOString();

    const unsignedManifest = {
      schema: 'org.avert.manifest.v1' as const,
      protection_id: protectionId,
      issuer: 'avert.research.local',
      owner_reference: ownerReference || null,
      created_at: createdAt,
      expires_at: expiresAt || null,
      policy: {
        ai_editing: policy,
      },
      asset_binding: {
        algorithm: 'sha256' as const,
        digest: protectedSha256,
      },
      defense: {
        profile: applyExperimentalPerturbation
          ? ('imageprotector_bim_l_inf' as const)
          : ('none' as const),
        version: '2.0',
        epsilon_over_255: applyExperimentalPerturbation ? epsilonOver255 : 0,
        step_size_alpha: applyExperimentalPerturbation ? stepSizeAlpha : 0,
        max_iter: applyExperimentalPerturbation ? maxIter : 0,
        shadow_question_type: shadowQuestionType,
        shadow_question_count: shadowQuestions.length,
        target_refusal: applyExperimentalPerturbation ? targetRefusal : null,
      },
      key_id: keyInfo.key_id,
    };

    const signedManifest = signManifest(unsignedManifest);

    const record: ProtectionRecord = {
      protection_id: protectionId,
      sample_or_filename: filename,
      policy,
      output_format: outputFormat,
      original_sha256: originalSha256,
      protected_sha256: protectedSha256,
      quality: exported.quality,
      experimental_defense: {
        applied: applyExperimentalPerturbation,
        profile: unsignedManifest.defense.profile,
        epsilon_over_255: unsignedManifest.defense.epsilon_over_255,
        step_size_alpha: unsignedManifest.defense.step_size_alpha,
        max_iter: unsignedManifest.defense.max_iter,
        shadow_question_type: shadowQuestionType,
        shadow_questions: shadowQuestions,
        target_refusal: unsignedManifest.defense.target_refusal,
        estimated_convergence_loss: exported.estimatedLoss,
      },
      manifest: signedManifest,
      revoked: false,
      revoked_at: null,
      created_at: createdAt,
      image_url: `/api/v1/protections/${protectionId}/image`,
      original_url: `/api/v1/protections/${protectionId}/original`,
      diff_url: `/api/v1/protections/${protectionId}/diff`,
      manifest_url: `/api/v1/protections/${protectionId}/manifest`,
    };

    saveProtection({
      record,
      originalBuffer: decoded.normalizedOriginalPng,
      protectedBuffer: exported.exportedBuffer,
      diffBuffer: exported.diffHeatmapBuffer,
    });

    recordAuditEvent({
      protection_id: protectionId,
      event_type: 'protection_created',
      decision: policy,
      reason_code: 'MANIFEST_SIGNED',
      details: `Exported ${outputFormat.toUpperCase()} (${decoded.width}x${decoded.height}), PSNR ${exported.quality.psnr_db} dB, SSIM ${exported.quality.ssim}, perturbation ${
        applyExperimentalPerturbation ? `ε=${epsilonOver255}/255` : 'none'
      }.`,
    });

    updateJob(jobId, {
      status: 'completed',
      stage: 'Exported protected derivative & signed manifest',
      progress: 100,
      protection_id: protectionId,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image processing error';
    updateJob(jobId, {
      status: 'failed',
      stage: 'Processing failed',
      progress: 100,
      error: message,
      completed_at: new Date().toISOString(),
    });
  }
}

async function seedDemoProtection() {
  const sampleId = 'sample_portrait';
  const inputBuffer = await getSampleImageBuffer(sampleId);
  const jobId = 'job_seed_demo';
  createJob(jobId);
  await runProtectionPipeline({
    jobId,
    protectionId: 'avert_demo_portrait',
    inputBuffer,
    filename: 'portrait_study.png',
    policy: 'deny',
    outputFormatPreference: 'same',
    applyExperimentalPerturbation: true,
    epsilonOver255: 8,
    stepSizeAlpha: 0.005,
    maxIter: 1000,
    shadowQuestionType: 'general',
    shadowQuestions: DEFAULT_GENERAL_SHADOW_QUESTIONS.slice(0, 10),
    targetRefusal: REFUSAL_TARGETS[0],
    ownerReference: 'studio-archive@avert.local',
    expiresAt: null,
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'avert-api',
      gemini_configured:
        Boolean(process.env.GEMINI_API_KEY) &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    });
  });

  app.get('/api/v1/keys/public', (_req: Request, res: Response) => {
    res.json(getPublicKeyInfo());
  });

  app.get('/api/v1/samples', (_req: Request, res: Response) => {
    res.json({
      samples: SAMPLE_DESCRIPTORS.map((s) => ({
        ...s,
        preview_url: `/api/v1/samples/${s.id}`,
      })),
    });
  });

  app.get('/api/v1/samples/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!SAMPLE_DESCRIPTORS.some((s) => s.id === id)) {
      res.status(404).json({ error: 'Sample not found' });
      return;
    }
    const buf = await getSampleImageBuffer(id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  });

  app.post('/api/v1/shadow-questions', async (req: Request, res: Response) => {
    const type = (req.body?.type ?? 'general') as ShadowQuestionType;
    const exampleQuestion = String(
      req.body?.example_question ?? 'Where was this photo taken?'
    );
    const count = Number(req.body?.count ?? 10);

    const result = await generateShadowQuestions({
      type,
      exampleQuestion,
      count,
    });
    res.json(result);
  });

  app.post(
    '/api/v1/protections',
    upload.single('image'),
    async (req: Request, res: Response) => {
      try {
        let inputBuffer: Buffer | null = null;
        let filename = 'uploaded_image.png';

        if (req.file) {
          inputBuffer = req.file.buffer;
          filename = path.basename(req.file.originalname || 'uploaded_image.png');
        } else if (req.body?.sample_id) {
          const sampleId = String(req.body.sample_id);
          const desc = SAMPLE_DESCRIPTORS.find((s) => s.id === sampleId);
          if (!desc) {
            res.status(400).json({ error: 'Unknown sample_id' });
            return;
          }
          inputBuffer = await getSampleImageBuffer(sampleId);
          filename = `${sampleId}.png`;
        }

        if (!inputBuffer) {
          res.status(400).json({ error: 'No image file or sample_id provided' });
          return;
        }

        const policyRaw = String(req.body?.policy ?? 'deny');
        const policy: AiEditingPolicy =
          policyRaw === 'allow' || policyRaw === 'require_authorization'
            ? policyRaw
            : 'deny';

        const formatRaw = String(req.body?.output_format ?? 'same').toLowerCase();
        const outputFormatPreference: OutputFormatPreference =
          formatRaw === 'png' || formatRaw === 'webp'
            ? formatRaw
            : formatRaw === 'jpeg' || formatRaw === 'jpg'
              ? 'jpeg'
              : 'same';

        const applyExperimentalPerturbation =
          String(req.body?.apply_perturbation ?? 'true') !== 'false';
        const epsilonOver255 = Number(req.body?.epsilon_over_255 ?? 8);
        const stepSizeAlpha = Number(req.body?.step_size_alpha ?? 0.005);
        const maxIter = Number(req.body?.max_iter ?? 1000);
        const shadowQuestionType = (req.body?.shadow_question_type ??
          'general') as ShadowQuestionType;

        let shadowQuestions = DEFAULT_GENERAL_SHADOW_QUESTIONS.slice(0, 10);
        if (req.body?.shadow_questions) {
          try {
            const parsed =
              typeof req.body.shadow_questions === 'string'
                ? JSON.parse(req.body.shadow_questions)
                : req.body.shadow_questions;
            if (Array.isArray(parsed) && parsed.length > 0) {
              shadowQuestions = parsed.map((q) => String(q));
            }
          } catch {
            // keep default
          }
        }

        const targetRefusal =
          typeof req.body?.target_refusal === 'string' && req.body.target_refusal.trim()
            ? req.body.target_refusal.trim()
            : REFUSAL_TARGETS[0];

        const ownerReference =
          typeof req.body?.owner_reference === 'string' && req.body.owner_reference.trim()
            ? req.body.owner_reference.trim()
            : null;

        let expiresAt: string | null = null;
        if (req.body?.expires_hours) {
          const hrs = Number(req.body.expires_hours);
          if (Number.isFinite(hrs) && hrs > 0) {
            expiresAt = new Date(Date.now() + hrs * 3600 * 1000).toISOString();
          }
        }

        const jobId = `job_${crypto.randomBytes(5).toString('hex')}`;
        const protectionId = `avert_${crypto.randomBytes(5).toString('hex')}`;
        createJob(jobId);

        // Execute asynchronously so polling reflects real backend status transitions
        void runProtectionPipeline({
          jobId,
          protectionId,
          inputBuffer,
          filename,
          policy,
          outputFormatPreference,
          applyExperimentalPerturbation,
          epsilonOver255,
          stepSizeAlpha,
          maxIter,
          shadowQuestionType,
          shadowQuestions,
          targetRefusal,
          ownerReference,
          expiresAt,
        });

        res.status(202).json({
          job_id: jobId,
          status: 'queued',
          status_url: `/api/v1/jobs/${jobId}`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to queue protection job';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.get('/api/v1/jobs/:jobId', (req: Request, res: Response) => {
    const job = getJob(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(job);
  });

  app.get('/api/v1/protections', (_req: Request, res: Response) => {
    res.json({ protections: listProtections() });
  });

  app.get('/api/v1/protections/:id', (req: Request, res: Response) => {
    const entry = getProtection(String(req.params.id));
    if (!entry) {
      res.status(404).json({ error: 'Protection record not found' });
      return;
    }
    res.json(entry.record);
  });

  app.get('/api/v1/protections/:id/image', (req: Request, res: Response) => {
    const entry = getProtection(String(req.params.id));
    if (!entry) {
      res.status(404).json({ error: 'Protected image not found' });
      return;
    }
    const fmt = entry.record.output_format;
    const ext = resolveDownloadExtension(fmt, entry.record.sample_or_filename);
    res.setHeader('Content-Type', `image/${fmt === 'jpeg' ? 'jpeg' : fmt}`);
    if (req.query.download === '1') {
      const base = entry.record.sample_or_filename.replace(/\.[^.]+$/, '');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${base}_avert_protected.${ext}"`
      );
    }
    res.send(entry.protectedBuffer);
  });

  app.get('/api/v1/protections/:id/original', (req: Request, res: Response) => {
    const entry = getProtection(String(req.params.id));
    if (!entry) {
      res.status(404).json({ error: 'Original image not found' });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.send(entry.originalBuffer);
  });

  app.get('/api/v1/protections/:id/diff', (req: Request, res: Response) => {
    const entry = getProtection(String(req.params.id));
    if (!entry) {
      res.status(404).json({ error: 'Perturbation diff not found' });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.send(entry.diffBuffer);
  });

  app.get('/api/v1/protections/:id/manifest', (req: Request, res: Response) => {
    const entry = getProtection(String(req.params.id));
    if (!entry) {
      res.status(404).json({ error: 'Manifest not found' });
      return;
    }
    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${entry.record.protection_id}.manifest.json"`
      );
    }
    res.json(entry.record.manifest);
  });

  app.post(
    '/api/v1/verify',
    upload.single('image'),
    (req: Request, res: Response) => {
      try {
        let manifest: AvertManifest | null = null;
        if (req.body?.manifest) {
          manifest =
            typeof req.body.manifest === 'string'
              ? JSON.parse(req.body.manifest)
              : req.body.manifest;
        } else if (req.body?.protection_id && !req.body?.manifest_omitted) {
          const stored = getProtection(String(req.body.protection_id));
          if (stored) manifest = stored.record.manifest;
        }

        let imageSha256: string | null = req.body?.image_sha256
          ? String(req.body.image_sha256)
          : null;

        if (req.file) {
          imageSha256 = sha256Hex(req.file.buffer);
        } else if (!imageSha256 && req.body?.protection_id) {
          const stored = getProtection(String(req.body.protection_id));
          if (stored) imageSha256 = stored.record.protected_sha256;
        }

        const sigValid = manifest ? verifyManifestSignature(manifest) : false;
        const storedRecord = manifest?.protection_id
          ? getProtection(manifest.protection_id)?.record
          : undefined;
        const revoked = storedRecord?.revoked ?? false;

        let grantValid = false;
        if (req.body?.grant_id && manifest) {
          const grantCheck = validateAndConsumeGrant({
            grantId: String(req.body.grant_id),
            protectionId: manifest.protection_id,
            assetDigest: manifest.asset_binding?.digest ?? '',
            consume: false,
          });
          grantValid = grantCheck.valid;
        }

        const verification = evaluateVerificationState({
          manifest,
          imageSha256,
          signatureValid: sigValid,
          revoked,
          authorizationGrantValid: grantValid,
        });

        if (manifest?.protection_id) {
          recordAuditEvent({
            protection_id: manifest.protection_id,
            event_type: 'manifest_verified',
            decision: verification.decision,
            reason_code: verification.reason_code,
            details: verification.message,
          });
        }

        res.json({
          ...verification,
          computed_image_sha256: imageSha256,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid verification payload';
        res.status(400).json({ error: msg });
      }
    }
  );

  app.post('/api/v1/verify/simulate-tamper', async (req: Request, res: Response) => {
    const protectionId = String(req.body?.protection_id ?? '');
    const mode = String(req.body?.mode ?? 'recompress_jpeg');
    const entry = getProtection(protectionId);
    if (!entry) {
      res.status(404).json({ error: 'Protection record not found' });
      return;
    }

    let tamperedDigest: string;
    let manifestToCheck = entry.record.manifest;
    let simulationNote = '';

    if (mode === 'tamper_manifest_policy') {
      // Simulate attacker editing manifest policy from deny -> allow without private key
      manifestToCheck = {
        ...entry.record.manifest,
        policy: { ai_editing: 'allow' },
      };
      tamperedDigest = entry.record.protected_sha256;
      simulationNote =
        'Simulated manifest tampering: policy altered from deny to allow without Ed25519 signature update.';
    } else {
      // Simulate attacker recompressing the protected image as JPEG quality 85
      const recompressed = await sharp(entry.protectedBuffer)
        .jpeg({ quality: 85 })
        .toBuffer();
      tamperedDigest = sha256Hex(recompressed);
      simulationNote =
        'Simulated image recompression (JPEG Q=85): pixel bytes changed, invalidating exact SHA-256 asset binding.';
    }

    const sigValid = verifyManifestSignature(manifestToCheck);
    const verification = evaluateVerificationState({
      manifest: manifestToCheck,
      imageSha256: tamperedDigest,
      signatureValid: sigValid,
      revoked: entry.record.revoked,
    });

    recordAuditEvent({
      protection_id: protectionId,
      event_type: 'manifest_verified',
      decision: verification.decision,
      reason_code: verification.reason_code,
      details: simulationNote,
    });

    res.json({
      ...verification,
      simulation_note: simulationNote,
      computed_image_sha256: tamperedDigest,
    });
  });

  app.post('/api/v1/authorize', (req: Request, res: Response) => {
    const protectionId = String(req.body?.protection_id ?? '');
    const permittedOperation = String(
      req.body?.permitted_operation ?? 'single_edit_session'
    );
    const ttlMinutes = Number(req.body?.ttl_minutes ?? 15);
    const entry = getProtection(protectionId);
    if (!entry) {
      res.status(404).json({ error: 'Protection record not found' });
      return;
    }
    if (entry.record.revoked) {
      res.status(400).json({ error: 'Cannot authorize a revoked credential' });
      return;
    }

    const grant = issueAuthorizationGrant({
      protectionId,
      assetDigest: entry.record.protected_sha256,
      permittedOperation,
      ttlMinutes,
    });

    res.json(grant);
  });

  app.post('/api/v1/revoke/:id', (req: Request, res: Response) => {
    const updated = revokeProtection(String(req.params.id));
    if (!updated) {
      res.status(404).json({ error: 'Protection record not found' });
      return;
    }
    res.json(updated);
  });

  app.get('/api/v1/audit/:id', (req: Request, res: Response) => {
    const protectionId = String(req.params.id);
    res.json({ events: getAuditEvents(protectionId) });
  });

  app.post('/api/v1/editor/execute', async (req: Request, res: Response) => {
    const protectionId = String(req.body?.protection_id ?? '');
    const editInstruction = String(
      req.body?.edit_instruction ?? 'Remove the background and alter subject details'
    ).trim();
    const grantId = req.body?.grant_id ? String(req.body.grant_id) : undefined;
    const strictMode = req.body?.strict_mode !== false;

    const entry = getProtection(protectionId);
    if (!entry) {
      res.status(404).json({ error: 'Protection record not found' });
      return;
    }

    const manifest = entry.record.manifest;
    const sigValid = verifyManifestSignature(manifest);
    const imageSha256 = sha256Hex(entry.protectedBuffer);

    let grantValid = false;
    let grantError: string | null = null;
    if (manifest.policy.ai_editing === 'require_authorization' && grantId) {
      const check = validateAndConsumeGrant({
        grantId,
        protectionId,
        assetDigest: entry.record.protected_sha256,
        consume: sigValid && !entry.record.revoked,
      });
      grantValid = check.valid;
      if (!check.valid) grantError = check.reason;
    }

    const verification = evaluateVerificationState({
      manifest,
      imageSha256,
      signatureValid: sigValid,
      revoked: entry.record.revoked,
      authorizationGrantValid: grantValid,
    });

    // Fail-safe compatible editor policy gate
    if (
      verification.decision === 'refuse' ||
      verification.decision === 'require_authorization' ||
      (verification.decision === 'unverified' && strictMode)
    ) {
      const refusalReason = grantError
        ? `${verification.reason_code} (${grantError})`
        : verification.reason_code;

      recordAuditEvent({
        protection_id: protectionId,
        event_type: 'editor_refused',
        decision: 'refuse',
        reason_code: verification.reason_code,
        details: `Compatible editor blocked instruction "${editInstruction}": ${refusalReason}`,
      });

      res.json({
        executed: false,
        decision: 'refuse',
        verification,
        grant_error: grantError,
        editor_message:
          verification.decision === 'require_authorization'
            ? `Refused: Owner authorization grant required before editing (${grantError ?? 'no valid grant supplied'}).`
            : `Refused (${verification.reason_code}): ${verification.message}`,
      });
      return;
    }

    // Permitted: proceed to AI edit analysis via server-side Gemini 4 Hydrogen
    const mimeType = `image/${entry.record.output_format === 'jpeg' ? 'jpeg' : entry.record.output_format}`;
    const analysis = await runCompatibleEditorEditAnalysis({
      imageBuffer: entry.protectedBuffer,
      mimeType,
      editInstruction,
    });

    recordAuditEvent({
      protection_id: protectionId,
      event_type: 'editor_allowed',
      decision: 'allow',
      reason_code: verification.reason_code,
      details: `Compatible editor authorized instruction "${editInstruction}" via ${analysis.modelUsed}.`,
    });

    res.json({
      executed: true,
      decision: 'allow',
      verification,
      editor_message: analysis.outputText,
      model_used: analysis.modelUsed,
    });
  });

  app.post('/api/v1/probe/non-cooperative', async (req: Request, res: Response) => {
    const protectionId = String(req.body?.protection_id ?? '');
    const probingQuestion = String(
      req.body?.probing_question ?? 'Describe the people, text, and location in this image.'
    ).trim();
    const transform = (req.body?.transform ?? 'none') as
      | 'none'
      | 'jpeg_75'
      | 'gaussian_noise_001'
      | 'gaussian_noise_020'
      | 'resize_50_up'
      | 'crop_10';

    const entry = getProtection(protectionId);
    if (!entry) {
      res.status(404).json({ error: 'Protection record not found' });
      return;
    }

    const transformed = await applyAttackerTransformation({
      imageBuffer: entry.protectedBuffer,
      transform,
    });

    const probeResult = await runNonCooperativeMllmProbe({
      imageBuffer: transformed.buffer,
      mimeType: transformed.mimeType,
      probingQuestion,
    });

    const transformedSha = sha256Hex(transformed.buffer);
    const bindingIntact = transformedSha === entry.record.protected_sha256;

    recordAuditEvent({
      protection_id: protectionId,
      event_type: 'non_cooperative_probe',
      decision: probeResult.judgeVerdict,
      reason_code: transform.toUpperCase(),
      details: `Non-cooperative probe (${transformed.description}): Judge verdict = ${probeResult.judgeVerdict}.`,
    });

    res.json({
      transform_applied: transformed.description,
      binding_intact_after_transform: bindingIntact,
      transformed_sha256: transformedSha,
      probing_question: probingQuestion,
      ...probeResult,
    });
  });

  await seedDemoProtection();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AVERT full-stack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AVERT server:', err);
  process.exit(1);
});
