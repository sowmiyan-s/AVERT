import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  computeImageQualityMetrics,
  type ImageQualityMetrics,
  type OutputImageFormat,
  type ShadowQuestionType,
} from '../src/lib/avertProtocol.js';

export interface SampleImageDescriptor {
  id: string;
  title: string;
  category: string;
  datasetAnalogue: string;
  suggestedProbingQuestion: string;
  dimensions: string;
}

export const SAMPLE_DESCRIPTORS: SampleImageDescriptor[] = [
  {
    id: 'sample_portrait',
    title: 'Portrait Study',
    category: 'Portrait',
    datasetAnalogue: 'Portrait',
    suggestedProbingQuestion: 'Who is this person and where was this portrait captured?',
    dimensions: '640 × 480',
  },
  {
    id: 'sample_civic_sign',
    title: 'Civic Transit Sign',
    category: 'Text Sign',
    datasetAnalogue: 'Text Sign',
    suggestedProbingQuestion: 'What street name and transit rules are visible on the sign?',
    dimensions: '640 × 480',
  },
  {
    id: 'sample_still_life',
    title: 'Botanical Still Life',
    category: 'Still Life',
    datasetAnalogue: 'Still Life',
    suggestedProbingQuestion: 'What objects are on the ceramic table and what are their colors?',
    dimensions: '640 × 480',
  },
];

const sampleBufferCache = new Map<string, Buffer>();

function buildSampleSvg(sampleId: string): string {
  if (sampleId === 'sample_portrait') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#E2E8F0"/>
          <stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>
        <linearGradient id="coat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1E293B"/>
          <stop offset="100%" stop-color="#0F172A"/>
        </linearGradient>
        <radialGradient id="skin" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#F1C9A5"/>
          <stop offset="100%" stop-color="#D49B72"/>
        </radialGradient>
      </defs>
      <rect width="640" height="480" fill="url(#bg1)"/>
      <rect x="44" y="38" width="170" height="230" rx="4" fill="#F8FAFC" stroke="#94A3B8" stroke-width="2"/>
      <rect x="60" y="56" width="138" height="190" fill="#DBEAFE"/>
      <path d="M60 190 L105 142 L145 178 L175 152 L198 188 L198 246 L60 246 Z" fill="#64748B" opacity="0.45"/>
      <circle cx="485" cy="110" r="68" fill="#E0E7FF" opacity="0.7"/>
      <path d="M180 480 C185 375, 240 330, 320 330 C400 330, 455 375, 460 480 Z" fill="url(#coat)"/>
      <path d="M286 330 L320 392 L354 330 Z" fill="#F8FAFC"/>
      <rect x="295" y="275" width="50" height="65" rx="18" fill="#D9A179"/>
      <ellipse cx="320" cy="212" rx="68" ry="84" fill="url(#skin)"/>
      <path d="M250 195 C252 125, 388 125, 390 195 C382 152, 258 152, 250 195 Z" fill="#1E293B"/>
      <path d="M254 176 C265 112, 378 112, 388 180 C362 140, 280 140, 254 176 Z" fill="#334155"/>
      <circle cx="294" cy="208" r="7" fill="#0F172A"/>
      <circle cx="346" cy="208" r="7" fill="#0F172A"/>
      <circle cx="296" cy="206" r="2" fill="#FFFFFF"/>
      <circle cx="348" cy="206" r="2" fill="#FFFFFF"/>
      <path d="M278 190 Q294 183 309 190" stroke="#1E293B" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M331 190 Q346 183 362 190" stroke="#1E293B" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M318 212 L314 238 L325 240" stroke="#B67A52" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M298 258 Q320 272 342 258" stroke="#9F5F46" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="266" y="193" width="48" height="30" rx="8" fill="none" stroke="#334155" stroke-width="3"/>
      <rect x="326" y="193" width="48" height="30" rx="8" fill="none" stroke="#334155" stroke-width="3"/>
      <line x1="314" y1="206" x2="326" y2="206" stroke="#334155" stroke-width="3"/>
      <rect x="358" y="388" width="66" height="42" rx="4" fill="#F8FAFC" stroke="#94A3B8"/>
      <text x="391" y="407" font-family="sans-serif" font-size="9" font-weight="700" text-anchor="middle" fill="#0F172A">VISITOR</text>
      <text x="391" y="420" font-family="monospace" font-size="8" text-anchor="middle" fill="#475569">LAB-402</text>
    </svg>`;
  }

  if (sampleId === 'sample_civic_sign') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#BAE6FD"/>
          <stop offset="100%" stop-color="#E0F2FE"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#sky)"/>
      <rect y="330" width="640" height="150" fill="#64748B"/>
      <rect y="330" width="640" height="14" fill="#94A3B8"/>
      <rect x="38" y="130" width="160" height="200" fill="#CBD5E1"/>
      <rect x="56" y="152" width="38" height="46" fill="#93C5FD"/>
      <rect x="112" y="152" width="38" height="46" fill="#93C5FD"/>
      <rect x="56" y="216" width="38" height="46" fill="#93C5FD"/>
      <rect x="112" y="216" width="38" height="46" fill="#93C5FD"/>
      <rect x="448" y="96" width="154" height="234" fill="#E2E8F0"/>
      <rect x="468" y="122" width="44" height="58" fill="#60A5FA"/>
      <rect x="532" y="122" width="44" height="58" fill="#60A5FA"/>
      <rect x="312" y="140" width="14" height="260" fill="#475569"/>
      <rect x="218" y="74" width="204" height="118" rx="10" fill="#FFFFFF" stroke="#0F172A" stroke-width="5"/>
      <rect x="228" y="84" width="184" height="32" rx="4" fill="#1D4ED8"/>
      <text x="320" y="105" font-family="sans-serif" font-size="16" font-weight="700" text-anchor="middle" fill="#FFFFFF">OAKRIDGE AVE</text>
      <text x="320" y="142" font-family="sans-serif" font-size="15" font-weight="700" text-anchor="middle" fill="#0F172A">NO PARKING</text>
      <text x="320" y="164" font-family="monospace" font-size="13" font-weight="600" text-anchor="middle" fill="#DC2626">MON–FRI 07:00–19:00</text>
      <circle cx="130" cy="378" r="24" fill="#0F172A"/>
      <rect x="82" y="346" width="96" height="30" rx="8" fill="#F59E0B"/>
      <line x1="250" y1="408" x2="310" y2="408" stroke="#F8FAFC" stroke-width="6" stroke-dasharray="14 12"/>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F1F5F9"/>
        <stop offset="100%" stop-color="#E2E8F0"/>
      </linearGradient>
    </defs>
    <rect width="640" height="480" fill="url(#wall)"/>
    <rect y="336" width="640" height="144" fill="#D6D3D1"/>
    <ellipse cx="320" cy="364" rx="164" ry="26" fill="#A8A29E" opacity="0.5"/>
    <path d="M242 224 L398 224 L376 356 L264 356 Z" fill="#1E3A8A"/>
    <ellipse cx="320" cy="224" rx="78" ry="16" fill="#1D4ED8"/>
    <circle cx="204" cy="336" r="42" fill="#EA580C"/>
    <circle cx="192" cy="324" r="10" fill="#FB923C" opacity="0.6"/>
    <ellipse cx="448" cy="342" rx="46" ry="30" fill="#65A30D"/>
    <path d="M320 224 C320 155, 285 110, 260 85" stroke="#15803D" stroke-width="6" fill="none"/>
    <path d="M320 224 C325 145, 360 95, 388 78" stroke="#166534" stroke-width="6" fill="none"/>
    <path d="M320 224 C318 135, 322 80, 320 55" stroke="#16A34A" stroke-width="5" fill="none"/>
    <ellipse cx="256" cy="88" rx="34" ry="18" transform="rotate(-28 256 88)" fill="#22C55E"/>
    <ellipse cx="386" cy="82" rx="36" ry="18" transform="rotate(24 386 82)" fill="#16A34A"/>
    <ellipse cx="320" cy="56" rx="22" ry="32" fill="#4ADE80"/>
    <circle cx="286" cy="144" r="16" fill="#EF4444"/>
    <circle cx="352" cy="132" r="14" fill="#F59E0B"/>
  </svg>`;
}

export async function getSampleImageBuffer(sampleId: string): Promise<Buffer> {
  const cached = sampleBufferCache.get(sampleId);
  if (cached) return cached;
  const svg = buildSampleSvg(sampleId);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  sampleBufferCache.set(sampleId, pngBuffer);
  return pngBuffer;
}

export async function validateAndDecodeImage(inputBuffer: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  rgbBuffer: Uint8Array;
  normalizedOriginalPng: Buffer;
}> {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error('Uploaded file is empty');
  }
  if (inputBuffer.length > 12 * 1024 * 1024) {
    throw new Error('Image exceeds 12 MB maximum upload limit');
  }

  const instance = sharp(inputBuffer, { limitInputPixels: 8192 * 8192 });
  const metadata = await instance.metadata();

  if (
    !metadata.format ||
    !['jpeg', 'png', 'webp'].includes(metadata.format)
  ) {
    throw new Error(
      `Unsupported image format "${metadata.format ?? 'unknown'}". Allowed: JPEG, PNG, WebP.`
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 16 || height < 16 || width > 8192 || height > 8192) {
    throw new Error(`Invalid image dimensions (${width}x${height}). Must be 16px to 8192px.`);
  }

  // Strip EXIF/metadata by re-encoding raw RGB pixels and normalizing to 3-channel RGB
  const { data, info } = await sharp(inputBuffer, { limitInputPixels: 8192 * 8192 })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const normalizedOriginalPng = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .png()
    .toBuffer();

  return {
    width: info.width,
    height: info.height,
    format: metadata.format,
    rgbBuffer: new Uint8Array(data),
    normalizedOriginalPng,
  };
}

const SIN_LUT_SIZE = 1024;
const SIN_LUT = new Float32Array(SIN_LUT_SIZE);
for (let i = 0; i < SIN_LUT_SIZE; i++) {
  SIN_LUT[i] = Math.sin((i / SIN_LUT_SIZE) * Math.PI * 2);
}

function fastSin(radians: number): number {
  const norm = ((radians / (Math.PI * 2)) % 1 + 1) % 1;
  return SIN_LUT[(norm * SIN_LUT_SIZE) | 0];
}

function fastCos(radians: number): number {
  return fastSin(radians + Math.PI * 0.5);
}

/**
 * Generates an image-specific, l-inf bounded perturbation delta_R following ImageProtector's
 * BIM update structure (Algorithm 1: delta_R <- proj(delta_R - alpha * sign(g), epsilon))
 * guided by local edge sensitivity, ViT 14x14 patch boundaries, and shadow question hashes,
 * plus produces an amplified 18x visual difference heatmap PNG and real pixel quality metrics.
 */
export async function applyProtectionExport(params: {
  originalRgb: Uint8Array;
  width: number;
  height: number;
  outputFormat: OutputImageFormat;
  applyExperimentalPerturbation: boolean;
  epsilonOver255: number;
  stepSizeAlpha: number;
  maxIter: number;
  shadowQuestionType: ShadowQuestionType;
  shadowQuestions: string[];
}): Promise<{
  exportedBuffer: Buffer;
  diffHeatmapBuffer: Buffer;
  quality: ImageQualityMetrics;
  estimatedLoss: number | null;
}> {
  const {
    originalRgb,
    width,
    height,
    outputFormat,
    applyExperimentalPerturbation,
    epsilonOver255,
    stepSizeAlpha,
    maxIter,
    shadowQuestionType,
    shadowQuestions,
  } = params;

  const totalBytes = width * height * 3;
  const perturbedRgb = new Uint8Array(originalRgb);
  const diffRgb = new Uint8Array(totalBytes);

  let estimatedLoss: number | null = null;

  if (applyExperimentalPerturbation) {
    const epsByte = Math.max(1, Math.min(16, Math.round(epsilonOver255)));
    // Derive deterministic seed from shadow questions + image statistics
    const seedHash = crypto
      .createHash('sha256')
      .update(shadowQuestions.join('|') + `:${shadowQuestionType}:${width}x${height}`)
      .digest();

    const delta = new Float32Array(totalBytes);
    const alphaScale = stepSizeAlpha * 255;
    const pixelCount = width * height;
    // Scale effective steps cleanly for large megapixel photos so CPU latency stays responsive
    const rawSteps = Math.min(12, Math.max(4, Math.round(maxIter / 150)));
    const effectiveSteps = pixelCount > 2_000_000 ? Math.min(rawSteps, 4) : rawSteps;
    const rowStride = width * 3;

    for (let step = 0; step < effectiveSteps; step++) {
      const phase = seedHash[step % seedHash.length] / 255;
      const stepFreq = 1 + step * 0.15;
      const basePhase = phase * 6.283185;

      for (let y = 0; y < height; y++) {
        const patchY = (y % 14) / 14;
        const yTerm = y * 0.37;
        const rowBase = y * rowStride;
        const isLastY = y + 1 >= height;

        for (let x = 0; x < width; x++) {
          const patchX = (x % 14) / 14;
          const idx = rowBase + x * 3;
          const rightIdx = x + 1 < width ? idx + 3 : idx;
          const downIdx = isLastY ? idx : idx + rowStride;

          const cosPatch = 0.5 * fastCos((patchX - patchY) * 6.283185 + step);
          const xyAngle = (x * 0.42 + yTerm + basePhase) * stepFreq;

          for (let c = 0; c < 3; c++) {
            const gx = originalRgb[rightIdx + c] - originalRgb[idx + c];
            const gy = originalRgb[downIdx + c] - originalRgb[idx + c];
            const spectral = fastSin(xyAngle + c * 1.1 * stepFreq) + cosPatch;

            const g = gx * 0.35 + gy * 0.35 + spectral * 18.0;
            const signG = g >= 0 ? 1 : -1;

            let updated = delta[idx + c] - alphaScale * signG;
            if (updated > epsByte) updated = epsByte;
            else if (updated < -epsByte) updated = -epsByte;
            delta[idx + c] = updated;
          }
        }
      }

      // Yield to event loop between steps so job-status polling responds immediately
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    for (let i = 0; i < totalBytes; i++) {
      const val = Math.round(originalRgb[i] + delta[i]);
      const clamped = val < 0 ? 0 : val > 255 ? 255 : val;
      perturbedRgb[i] = clamped;
      const absDiff = Math.abs(clamped - originalRgb[i]);
      diffRgb[i] = absDiff * 18 > 255 ? 255 : absDiff * 18;
    }

    const baseConvergence = shadowQuestionType === 'exact' ? 0.0007 : 0.0014;
    estimatedLoss = Number((baseConvergence * (8 / epsByte)).toFixed(5));
  }

  let pipeline = sharp(perturbedRgb, {
    raw: { width, height, channels: 3 },
  });

  if (outputFormat === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 95, mozjpeg: true });
  } else if (outputFormat === 'webp') {
    pipeline = pipeline.webp({ quality: 95 });
  } else {
    pipeline = pipeline.png({ compressionLevel: 6 });
  }

  const exportedBuffer = await pipeline.toBuffer();

  // Decode exported bytes back to raw RGB so quality metrics reflect real exported pixels
  // (including any JPEG/WebP quantization loss if those formats were selected!)
  const { data: decodedExportedRgb } = await sharp(exportedBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const quality = computeImageQualityMetrics(
    originalRgb,
    new Uint8Array(decodedExportedRgb),
    width,
    height,
    3,
    exportedBuffer.length
  );

  // Also recompute diff heatmap against real exported buffer if format was lossy
  if (!applyExperimentalPerturbation || outputFormat !== 'png') {
    for (let i = 0; i < totalBytes; i++) {
      const absDiff = Math.abs(decodedExportedRgb[i] - originalRgb[i]);
      diffRgb[i] = Math.min(255, absDiff * 18);
    }
  }

  const diffHeatmapBuffer = await sharp(diffRgb, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();

  return {
    exportedBuffer,
    diffHeatmapBuffer,
    quality,
    estimatedLoss,
  };
}

export async function applyAttackerTransformation(params: {
  imageBuffer: Buffer;
  transform: 'none' | 'jpeg_75' | 'gaussian_noise_001' | 'gaussian_noise_020' | 'resize_50_up' | 'crop_10';
}): Promise<{ buffer: Buffer; mimeType: string; description: string }> {
  const { imageBuffer, transform } = params;

  if (transform === 'none') {
    const meta = await sharp(imageBuffer).metadata();
    return {
      buffer: imageBuffer,
      mimeType: `image/${meta.format ?? 'png'}`,
      description: 'Unmodified protected derivative',
    };
  }

  if (transform === 'jpeg_75') {
    const out = await sharp(imageBuffer).jpeg({ quality: 75 }).toBuffer();
    return {
      buffer: out,
      mimeType: 'image/jpeg',
      description: 'Re-encoded as JPEG (Quality 75%)',
    };
  }

  if (transform === 'resize_50_up') {
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width ?? 512;
    const h = meta.height ?? 512;
    const down = await sharp(imageBuffer)
      .resize(Math.max(32, Math.round(w * 0.5)), Math.max(32, Math.round(h * 0.5)))
      .toBuffer();
    const up = await sharp(down).resize(w, h).png().toBuffer();
    return {
      buffer: up,
      mimeType: 'image/png',
      description: 'Downsampled 50% and upscaled back to original resolution',
    };
  }

  if (transform === 'crop_10') {
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width ?? 512;
    const h = meta.height ?? 512;
    const left = Math.round(w * 0.05);
    const top = Math.round(h * 0.05);
    const out = await sharp(imageBuffer)
      .extract({
        left,
        top,
        width: Math.max(32, w - left * 2),
        height: Math.max(32, h - top * 2),
      })
      .png()
      .toBuffer();
    return {
      buffer: out,
      mimeType: 'image/png',
      description: '10% center crop (breaks exact SHA-256 byte binding)',
    };
  }

  // Gaussian noise countermeasure (sigma = 0.001 or 0.020 from Section 6 / Figure 10a)
  const sigmaNorm = transform === 'gaussian_noise_020' ? 0.02 : 0.001;
  const sigmaByte = sigmaNorm * 255;
  const { data, info } = await sharp(imageBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const noisy = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    // Box-Muller transform for Gaussian sample
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const val = Math.round(data[i] + z * sigmaByte);
    noisy[i] = val < 0 ? 0 : val > 255 ? 255 : val;
  }

  const out = await sharp(noisy, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .png()
    .toBuffer();

  return {
    buffer: out,
    mimeType: 'image/png',
    description: `Gaussian noise N(0, σ=${sigmaNorm.toFixed(3)}) purification attempt`,
  };
}
