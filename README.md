# AVERT — Adversarial Visual Editing Restriction Technology

Full-stack TypeScript web application for cryptographic AI-editing policy enforcement and experimental visual prompt injection research, built with Express, React, Vite, Sharp, Node `crypto`, and the Gemini API (`@google/genai`).

AVERT combines two strictly separated layers inspired by **ImageProtector** (*Shao et al., ACL 2026*) and the **AVERT Technical Blueprint**:

1. **Cooperative Policy & Provenance Layer (Cryptographic Control)**:
   Server-side Ed25519-signed sidecar manifests (`org.avert.manifest.v1`) bound to exact protected image bytes via SHA-256, enforcing `deny`, `require_authorization`, or `allow` policies with expiry, revocation, and single-use scoped owner grants.
2. **Experimental Perturbation Layer (Research Control)**:
   Configurable $\ell_\infty$-bounded Basic Iterative Method (BIM) pixel perturbation (`epsilon_over_255`, `step_size_alpha`, `max_iter`, shadow-question strategy, and refusal target phrases) with real measured PSNR, SSIM, $\ell_\infty$, and 18× amplified difference heatmaps.

---

## Workspaces

- **Protect**: Upload an image or pick a built-in sample, configure the AI editing policy (`Block AI editing`, `Ask owner first`, or `Allow editing`), select output format (`Same as uploaded`, `PNG`, `JPEG`, or `WebP`), configure optional BIM perturbation and shadow questions (with Gemini generation), export a universally viewable 8-bit sRGB derivative, and download the signed JSON manifest.
- **Verify**: Inspect Ed25519 signature validity, SHA-256 asset digest matching, expiry, and revocation status; simulate JPEG recompression or manifest policy tampering; issue single-use owner authorization grants; revoke credentials; or manually verify uploaded image bytes and manifest JSON.
- **Editor Lab**:
  - **Compatible AI Editor**: Demonstrates fail-safe pre-edit policy verification (refusing blocked assets, validating/consuming single-use grants, and invoking Gemini vision edit planning only when permitted).
  - **Unintegrated MLLM Probe**: Probes protected derivatives (including simulated JPEG-75, Gaussian noise $\sigma \in \{0.001, 0.020\}$, 50% resize, and 10% crop transforms) against Gemini (`gemini-4-hydrogen`) and evaluates responses using both refusal heuristics and the LLM refusal judge prompt.

---

## Supported Image Formats & Cross-Device Compatibility

- **Accepted Inputs**:
  - `JPEG` / `JPG` / `JFIF`, `PNG`, `WebP`, `AVIF`, `HEIC` / `HEIF` *(subject to host `libheif` codec support; AVIF verified)*, `GIF`, `TIFF`, `SVG`, uncompressed `24-bit` / `32-bit` `BMP`, and `ICO` (converted in-browser via `<canvas>`).
  - Handles CMYK, grayscale, RGBA, and 16-bit source images by baking EXIF orientation (`.rotate()`) and normalizing pixels to 8-bit 3-channel **sRGB**.
- **Universal Output Mapping (`output_format=same`)**:
  - `jpeg` / `png` / `webp` inputs preserve their uploaded format (`jpeg` outputs baseline `4:2:0` sRGB; `png` outputs non-palette 8-bit sRGB).
  - `heif`, `avif`, and `tiff` automatically export as universal baseline sRGB `JPEG`.
  - `gif`, `bmp`, and `svg` automatically export as universal 8-bit sRGB `PNG`.
  - All exported files strip EXIF metadata and return `X-Content-Type-Options: nosniff` plus RFC 5987 `Content-Disposition` headers for reliable downloads across desktop and mobile devices.
- **Large File & Proxy Resilience**:
  - Server upload limit is `12 MB` (`413` JSON response if exceeded).
  - Images larger than `2.5 MB` are automatically optimized client-side before upload, and any upstream proxy `413` response triggers an automatic resize/re-encode retry (`<= 750 KB`).

---

## Manifest Schema & Security Guarantees

Signed manifests follow `org.avert.manifest.v1` using deterministic canonical JSON serialization and an Ed25519 keypair generated in memory on the server:

- **What Cryptographic Enforcement Guarantees**:
  - Cooperative editors and verifiers can verify authenticity (`signature_valid`), exact asset binding (`digest_matches`), expiry (`not_expired`), revocation (`not_revoked`), and single-use owner grants (`authorization_valid`), failing closed under strict mode.
  - Modifying either the manifest policy or re-encoding/cropping the protected image invalidates verification immediately.
- **What Experimental Perturbations Do Not Guarantee**:
  - Perturbation synthesis in this web prototype is an $\ell_\infty$-bounded deterministic research proxy and does **not** run full multi-GPU white-box backpropagation against open-weight VLMs.
  - Non-cooperative third-party AI services ignore sidecar manifests and may answer queries or edit perturbed pixels, especially after JPEG recompression, resizing, cropping, or noise purification.
- **Persistence Scope**:
  - Protection records, jobs, grants, audit logs, and the Ed25519 signing keypair are stored **in memory** in `server/cryptoService.ts` and reset when the server restarts.

---

## API Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health and `gemini_configured` status |
| `GET` | `/api/v1/keys/public` | Active Ed25519 `key_id` and SPKI PEM public key |
| `GET` | `/api/v1/samples` | List built-in sample descriptors |
| `GET` | `/api/v1/samples/:id` | Fetch sample PNG asset |
| `POST` | `/api/v1/shadow-questions` | Generate `similar` or `general` shadow questions (Gemini or fallback) |
| `POST` | `/api/v1/protections` | Queue protection & manifest signing job (`multipart/form-data` or sample JSON) |
| `GET` | `/api/v1/jobs/:jobId` | Poll asynchronous protection job progress |
| `GET` | `/api/v1/protections` | List protection records |
| `GET` | `/api/v1/protections/:id` | Get a single protection record |
| `GET` | `/api/v1/protections/:id/image` | Stream or download (`?download=1`) protected derivative |
| `GET` | `/api/v1/protections/:id/original` | Stream normalized original sRGB PNG |
| `GET` | `/api/v1/protections/:id/diff` | Stream 18× amplified pixel residual heatmap PNG |
| `GET` | `/api/v1/protections/:id/manifest` | Fetch or download (`?download=1`) signed JSON manifest |
| `POST` | `/api/v1/verify` | Verify stored `protection_id` or uploaded image bytes + manifest JSON |
| `POST` | `/api/v1/verify/simulate-tamper` | Simulate JPEG Q=85 recompression or manifest policy tampering |
| `POST` | `/api/v1/authorize` | Issue a single-use, asset-bound authorization grant |
| `POST` | `/api/v1/revoke/:id` | Revoke a protection credential |
| `GET` | `/api/v1/audit/:id` | Retrieve protection, verification, grant, and editor audit events |
| `POST` | `/api/v1/editor/execute` | Run compatible AI editor policy gate (and Gemini edit plan if allowed) |
| `POST` | `/api/v1/probe/non-cooperative` | Apply attacker transform and probe non-cooperative MLLM refusal behavior |

---

## Environment Variables

Configure secrets via environment variables or the AI Studio Secrets panel (see `.env.example`):

- `GEMINI_API_KEY`: Optional server-side Gemini API key (`gemini-4-hydrogen`). When unset or left at the placeholder value, shadow question generation, compatible editor planning, and MLLM probing fall back cleanly to deterministic offline templates/responses.
- `PORT`: HTTP server port (defaults to `3000`).
- `NODE_ENV`: Set to `production` to serve prebuilt `dist/` assets instead of Vite dev middleware.

---

## Development, Build & Tests

Requires **Node.js 22+** (native TypeScript execution is used for `npm start`).

```bash
# Install dependencies
npm install

# Run full-stack development server (Express + Vite middleware on port 3000)
npm run dev

# Type-check TypeScript
npm run lint

# Run protocol & image metrics unit tests
npx --yes tsx --test src/lib/avertProtocol.test.ts

# Build frontend bundle into dist/
npm run build

# Run production server (serves dist/ + API routes on port 3000)
NODE_ENV=production npm start
```

---

## Project Structure

```text
.
├── index.html                  # HTML entry point & metadata
├── metadata.json               # App name, description & server-side Gemini capability
├── package.json                # Scripts (dev, start, build, lint) & dependencies
├── server.ts                   # Express server, API routes, error middleware, Vite/dist serving
├── server/
│   ├── cryptoService.ts        # Ed25519 keygen/signing, SHA-256, grants, in-memory store & audit log
│   ├── imageEngine.ts          # Sharp + BMP decoder, sRGB normalization, BIM perturbation & transforms
│   └── geminiService.ts        # Server-side @google/genai calls & offline fallbacks
└── src/
    ├── App.tsx                 # Top-level workspace router & shared protection state
    ├── lib/
    │   ├── avertProtocol.ts    # Canonical JSON, manifest verification, PSNR/SSIM, format mapping
    │   ├── avertProtocol.test.ts # Node test suite (node:test)
    │   └── paperBenchmarks.ts  # Shadow question templates & refusal targets
    └── components/
        ├── TopBar.tsx          # Navigation header
        ├── ProtectWorkspace.tsx # Image upload, policy controls, perturbation config & output viewer
        ├── VerifyWorkspace.tsx # Cryptographic verifier, tamper simulator, grants & audit trail
        └── EditorLabWorkspace.tsx # Compatible editor gate & non-cooperative MLLM probe lab
```
