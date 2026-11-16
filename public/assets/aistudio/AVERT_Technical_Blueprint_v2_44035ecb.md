# AVERT

## Technical Design, Research Foundation, Implementation Plan and Product Specification

**Document type:** Technical project blueprint\
**Project category:** AI security, adversarial machine learning, image
provenance and AI-editing interoperability\
**Status:** Proposed research and software prototype\
**Version:** 2.0
**System name:** AVERT — Adversarial Visual Editing Restriction Technology
**Research status:** Proposed prototype; effectiveness and novelty require experimental validation

------------------------------------------------------------------------

## 1. Executive summary

AVERT is a proposed system that lets an image owner mark an image
as protected against unauthorized AI editing. A user uploads an image,
chooses a protection profile, and receives a visually similar protected
image plus a protection record.

The system has two complementary protection paths:

1.  **Cooperative refusal:** An AI editor that integrates the
    AVERT verification protocol checks a signed protection
    credential and refuses editing when the credential says editing is
    not authorized.
2.  **Non-cooperative resistance:** For AI editors that do not integrate
    the protocol, an image-specific adversarial defense may reduce the
    quality or success of selected editing operations. This is a
    best-effort defense, not a guaranteed refusal mechanism.

This distinction is fundamental. An image file cannot universally force
an arbitrary third-party AI service to refuse. The image may be resized,
recompressed, screenshotted, cropped, denoised, reconstructed, or
processed by a different model. A refusal message is reliably
enforceable only by an editor that chooses to check and respect the
protection signal. Pixel perturbations can make certain model operations
harder, but cannot guarantee that every AI system will fail.

**Recommended first release:** Build a complete end-to-end product with
a working protection dashboard, signed credentials, a reference AI
editor that explicitly refuses protected images, and a research
benchmark for non-cooperative editing models. Do not claim universal
protection.

------------------------------------------------------------------------

## 2. Product goal and scope

### 2.1 User-facing goal

> Upload an image, protect it, and receive a version intended to resist
> unauthorized AI editing. Compatible AI editors should detect the
> protection and refuse editing unless the owner authorizes it.

### 2.2 In-scope capabilities

-   Upload JPEG, PNG and WebP images.
-   Validate file type, size and image dimensions.
-   Preview the original image.
-   Choose an editing policy: no AI edits, edits only with owner
    permission, or edits allowed.
-   Generate a signed protection manifest.
-   Optionally apply a research adversarial perturbation.
-   Export a protected image and a machine-readable sidecar manifest.
-   Verify a protected image in a AVERT-compatible editor.
-   Refuse editing when a valid manifest says editing is prohibited.
-   Provide a verification result and audit log.
-   Evaluate image quality and editing resistance against a defined
    model test set.

### 2.3 Out of scope for the first release

-   Guaranteeing refusal by ChatGPT, Gemini, Midjourney or any
    third-party product that does not implement the protocol.
-   Preventing screenshots, photography of a screen, or all forms of
    manual recreation.
-   Claiming that a watermark or metadata field alone provides security.
-   Training a large foundation model from scratch.
-   Making legal claims that the protection credential automatically
    establishes copyright ownership.

------------------------------------------------------------------------

## 3. Threat model

A clear threat model prevents exaggerated claims and guides experiments.

### 3.1 Assets to protect

-   The visual content of the original image.
-   The owner's editing preference.
-   The association between an image and its protection policy.
-   The integrity of the protection record.

### 3.2 Attacker capabilities

Assume an unauthorized user may: - Upload the protected image to an
external AI editor. - Remove ordinary metadata. - Re-encode or resize
the image. - Crop, rotate, screenshot or lightly alter it. - Apply
denoising or restoration. - Use a different image encoder or generative
model. - Attempt image-to-image reconstruction before editing.

### 3.3 Security objectives

  -----------------------------------------------------------------------
  Objective               Meaning                 Achievable guarantee
  ----------------------- ----------------------- -----------------------
  Protocol refusal        A compatible editor     Strong, if verification
                          refuses a prohibited    and policy enforcement
                          edit                    are correctly
                                                  implemented

  Credential integrity    A user cannot silently  Strong, with sound key
                          alter the policy        management
                          without invalidating    
                          the signature           

  Image-to-manifest       A manifest can be       Strong for exact bytes;
  binding                 checked against the     robust matching is
                          image it describes      probabilistic

  Adversarial resistance  Some unintegrated       Experimental, model-
                          models become less      and attack-dependent
                          capable of editing the  
                          image                   

  Universal refusal       Every arbitrary AI tool Not achievable by an
                          refuses                 image-only mechanism
  -----------------------------------------------------------------------

### 3.4 Trust boundaries

-   The browser is untrusted.
-   Uploaded files are untrusted.
-   The protection API and signing service are trusted.
-   The private signing key must never be exposed to the browser.
-   A third-party AI editor is trusted to enforce the protocol only if
    it explicitly integrates it.
-   A manifest copied separately from an image must not be treated as
    proof until the image binding is verified.

------------------------------------------------------------------------

## 4. System overview

``` text
                  AVERT WEB APPLICATION
                              |
                              v
                    Upload / Policy Selection
                              |
                              v
                       API Gateway
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
      File Validation                    User / Policy
      and Safe Decode                    Authorization
             |                                 |
             +----------------+----------------+
                              |
                              v
                    Image Processing Queue
                              |
                +-------------+-------------+
                |                           |
                v                           v
       Image Quality Analysis        Optional Defense
       dimensions / color /          Research perturbation
       perceptual baseline           generation
                |                           |
                +-------------+-------------+
                              |
                              v
                   Protected Image Export
                              |
                +-------------+-------------+
                |                           |
                v                           v
         Signed Manifest              Audit Event
                |                           |
                +-------------+-------------+
                              |
                              v
                 Protected Image + Manifest
                              |
                              v
             AVERT-COMPATIBLE AI EDITOR
                              |
                              v
                 Verify Signature and Binding
                              |
                 +------------+------------+
                 |                         |
             Invalid / absent          Valid credential
                 |                         |
                 v                         v
          Normal editor policy        Check edit policy
                                           |
                                  +--------+--------+
                                  |                 |
                              Prohibited          Allowed
                                  |                 |
                                  v                 v
                              REFUSE             Continue
```

The optional adversarial defense branch is a research feature. The
signed manifest and cooperating-editor verification path provide the
explicit refusal behavior.

------------------------------------------------------------------------

## 5. Core components

### 5.1 Frontend application

Recommended stack: - React + TypeScript. - Vite or Next.js. - Tailwind
CSS or a component library. - Browser-side preview using object URLs. -
Direct upload to backend or signed object-storage upload. - Download
action for protected image and manifest.

Responsibilities: - Display upload and validation states. - Show
original and protected previews side by side. - Collect the user's
protection policy. - Display progress and errors. - Show protection
status and verification details. - Never store signing secrets in
frontend code.

### 5.2 Backend API

Recommended stack: - Python 3.11+. - FastAPI. - Pydantic for request and
response validation. - SQLAlchemy and PostgreSQL for persistent
records. - Redis + Celery, Dramatiq or RQ for asynchronous processing. -
S3-compatible object storage such as AWS S3, Cloudflare R2 or MinIO. -
Docker for reproducible services.

Responsibilities: - Authenticate users. - Validate uploads. - Create
processing jobs. - Store image references and policy records. - Request
image processing. - Sign manifests. - Return download URLs and job
status. - Record verification and refusal events.

### 5.3 Image-processing worker

Recommended stack: - Python. - Pillow and OpenCV for safe image decoding
and transformations. - PyTorch for experimental adversarial methods. -
GPU worker only when model-based perturbation is enabled.

Responsibilities: - Decode and normalize images. - Preserve the original
as an immutable source. - Generate a protected derivative. - Measure
visual quality. - Compute image digests and perceptual fingerprints. -
Export the image and manifest.

Do not use a single global perturbation for every image. A research
defense should be image-specific and evaluated against explicit threat
models.

### 5.4 Credential and signing service

Use a standard digital-signature scheme, for example Ed25519.

-   Private key: server-side secret manager or KMS; never in the
    browser.
-   Public key: distributed to compatible verifiers.
-   Signature: covers a canonical serialization of the manifest.
-   Key ID: identifies which public key should verify the signature.
-   Key rotation and revocation: supported in the service design.

A signature proves that the trusted issuer signed the manifest and that
its signed fields were not modified. It does not prove that the person
who uploaded the image owns its copyright.

### 5.5 Compatible AI editor

Build a small reference editor to demonstrate the full refusal path.

Before running any edit: 1. Receive the image and optional manifest. 2.
Verify the manifest signature. 3. Verify that the manifest is bound to
the submitted image. 4. Check the policy and expiry/revocation status.
5. If the policy prohibits editing, return a refusal response. 6. If the
policy permits editing, continue through the editor's normal workflow.
7. Record the decision.

A compatible editor must fail safely if it cannot verify a credential
and the deployment's policy requires verification. It must not silently
treat an invalid signature as valid.

------------------------------------------------------------------------

## 6. User experience and screens

### Screen 1: Landing page

Purpose: explain the product without promising impossible guarantees.

Suggested headline: **Protect your images before sharing them.**

Supporting text: "Create a verifiable editing restriction for compatible
AI tools and test optional defenses against other image-editing models."

Primary action: **Protect an image**

Secondary action: **Verify an image**

### Screen 2: Upload

Elements: - Drag-and-drop upload area. - Browse files button. -
Supported types: JPEG, PNG, WebP. - Maximum upload size shown clearly. -
Privacy notice and retention period. - Original image preview. - File
name, dimensions and file size.

Validation: - Check actual decoded file format, not just extension or
MIME header. - Reject malformed files and excessive dimensions. - Apply
upload size and pixel-count limits. - Strip or explicitly handle EXIF
metadata according to user settings. - Never execute content embedded in
files.

### Screen 3: Protection settings

Offer clear policy options:

  Option             Policy behavior in compatible editors
  ------------------ ---------------------------------------
  Block AI editing   Refuse all AI editing
  Ask owner first    Require a valid authorization grant
  Allow editing      No editing restriction

Additional settings: - Credential expiry. - Optional owner contact or
account reference. - Optional visible label (off by default). -
Experimental adversarial defense (clearly marked experimental). - Output
format and quality.

Do not claim that selecting a policy makes unsupported third-party tools
enforce it.

### Screen 4: Processing

Show honest stages: 1. Validating image. 2. Preparing image. 3.
Generating optional research defense. 4. Measuring visual similarity. 5.
Creating signed policy record. 6. Exporting protected files.

Return job progress from the backend. Do not fake progress or claim
completion before the worker finishes.

### Screen 5: Results

Display: - Original and protected previews. - Visual similarity
metrics. - Policy selected. - Credential verification status. - Whether
experimental perturbation was applied. - Download protected image. -
Download manifest. - Copy verification ID. - Test in compatible editor.

### Screen 6: Verify / test

Allow a user to upload a protected image and its manifest, or scan a
supported embedded credential.

Show one of: - Valid credential --- editing prohibited. - Valid
credential --- editing allowed. - Invalid signature. - Image does not
match manifest. - Credential expired or revoked. - No supported
credential found.

Absence of a credential is not proof that an image is unprotected.

------------------------------------------------------------------------

## 7. Input and output contract

### 7.1 Protect request

Example API request:

``` http
POST /api/v1/protections
Content-Type: multipart/form-data
```

Fields: - `image`: uploaded image file. - `policy`: `block_ai_editing`,
`owner_approval`, or `allow`. - `defense_profile`: `none` or an
experimental profile ID. - `expires_at`: optional ISO-8601 timestamp. -
`output_format`: `png`, `jpeg`, or `webp`.

### 7.2 Initial response

``` json
{
  "job_id": "job_example",
  "status": "queued",
  "status_url": "/api/v1/jobs/job_example"
}
```

### 7.3 Job status response

``` json
{
  "job_id": "job_example",
  "status": "completed",
  "progress": 100,
  "protection_id": "avert_example",
  "protected_image_url": "/api/v1/protections/avert_example/image",
  "manifest_url": "/api/v1/protections/avert_example/manifest"
}
```

### 7.4 Example manifest

This is a conceptual schema. In production, use a documented canonical
serialization format and sign the exact canonical bytes.

``` json
{
  "schema": "org.avert.manifest.v1",
  "protection_id": "avert_example",
  "issuer": "avert.example",
  "created_at": "2026-11-16T00:00:00Z",
  "expires_at": null,
  "policy": {
    "ai_editing": "deny",
    "authorization": "owner_approval"
  },
  "asset_binding": {
    "algorithm": "sha256",
    "digest": "HEX_DIGEST_OF_EXPORTED_IMAGE"
  },
  "defense": {
    "profile": "none",
    "version": "1"
  },
  "key_id": "avert-signing-key-01",
  "signature": "BASE64_SIGNATURE"
}
```

The example has both a policy value and an authorization field to
illustrate the concept; define one unambiguous policy model in the
actual schema. Avoid contradictory policy fields.

For a simple first version, use: -
`ai_editing: deny | require_authorization | allow` - `asset_binding`:
exact SHA-256 digest of the exported file - `signature`: signature over
all manifest fields except the signature itself

### 7.5 Protect response

``` json
{
  "protection_id": "avert_example",
  "policy": "deny",
  "image": {
    "format": "png",
    "sha256": "..."
  },
  "manifest": {
    "signature_valid": true
  },
  "quality": {
    "ssim": 0.999,
    "psnr_db": 48.2
  },
  "experimental_defense": {
    "applied": false
  }
}
```

The quality values above are illustrative only, not expected results.
Calculate them from the actual original and exported image. SSIM and
PSNR are not sufficient by themselves to establish perceptual quality.

------------------------------------------------------------------------

## 8. How the protection actually works

### Layer A: Signed policy credential --- primary explicit refusal mechanism

This is the most reliable part of the first product.

1.  The backend receives the original image and selected policy.
2.  The image worker produces the final exported image.
3.  The backend computes SHA-256 over the exact exported bytes.
4.  The backend creates a manifest containing the policy, image digest,
    issuer, timestamps and key ID.
5.  The signing service signs the canonical manifest.
6.  The user receives the image and manifest.
7.  A compatible editor verifies the signature and exact image digest
    before editing.
8.  If the signature is valid and policy is `deny`, the editor refuses
    the edit.

Why this works: - The policy is explicit. - The signature prevents
undetected policy tampering. - The exact file digest binds the manifest
to one exported image. - The editor makes a deterministic policy
decision.

Limitation: - If the image is recompressed or cropped, the exact digest
changes. The verifier should report "image does not match manifest"
rather than assume the protection is absent or valid. - Robust image
matching can be added later, but perceptual matching is probabilistic
and can produce false matches. - An unintegrated AI editor may ignore
the manifest completely.

### Layer B: Optional adversarial image defense --- research mechanism

This is the experimental part intended to reduce editing success on
systems that do not understand the credential.

High-level research workflow: 1. Select a defined set of image-editing
models and operations. 2. Establish a baseline for editing success on
unprotected images. 3. Choose a measurable objective that makes the
protected input less useful for the target edit. 4. Optimize a small,
bounded, image-specific perturbation under a visual-quality constraint.
5. Export the protected derivative. 6. Evaluate it against held-out
models and transformations. 7. Compare quality and attack success with
existing defenses.

Potential model families to evaluate: - Diffusion-based image-to-image
systems. - Inpainting models. - Instruction-based image editing
models. - Vision encoders used to condition editing. - Restoration and
denoising systems used by an attacker.

Do not assume a perturbation that affects one encoder will affect all
others. Avoid overfitting the defense to the model used during
optimization. Use held-out architectures and model versions for
evaluation.

A useful research objective is multi-objective:

-   Reduce the success of a specified unauthorized edit.
-   Preserve perceptual similarity to the original.
-   Limit perturbation magnitude.
-   Retain effectiveness after common transformations.
-   Avoid making the image unusable for legitimate human viewing.

The exact loss function, optimization method and perturbation
constraints should be selected after reproducing baseline papers and
defining the threat model. Treat this as a research experiment, not a
security guarantee.

### Layer C: Robust provenance and image binding

A sidecar manifest is easy to lose. Consider standards-based content
credentials and embedded metadata as additional discovery mechanisms.

Important distinction: - A digital signature authenticates a record. - A
cryptographic digest binds the record to exact bytes. - A watermark or
robust fingerprint may help locate a record after some
transformations. - None of these alone forces an external AI service to
refuse.

Consider researching C2PA / Content Credentials for provenance
interoperability rather than inventing a proprietary provenance format
without need.

------------------------------------------------------------------------

## 9. Compatible editor refusal protocol

Define a small protocol for AI editors that choose to participate.

### Verification endpoint

``` http
POST /api/v1/verify
Content-Type: application/json
```

Example request:

``` json
{
  "image_sha256": "HEX_DIGEST",
  "manifest": {
    "schema": "org.avert.manifest.v1",
    "protection_id": "avert_example",
    "policy": {
      "ai_editing": "deny"
    },
    "asset_binding": {
      "algorithm": "sha256",
      "digest": "HEX_DIGEST"
    },
    "key_id": "avert-signing-key-01",
    "signature": "BASE64_SIGNATURE"
  }
}
```

Example response for a valid protected image:

``` json
{
  "valid": true,
  "decision": "refuse",
  "reason_code": "AI_EDITING_PROHIBITED",
  "message": "This image has a valid restriction against AI editing."
}
```

Example response for an invalid or mismatched record:

``` json
{
  "valid": false,
  "decision": "unverified",
  "reason_code": "IMAGE_OR_SIGNATURE_MISMATCH",
  "message": "The image protection record could not be verified."
}
```

The editor should not treat `unverified` as `allow`. Its own product
policy must define how to handle unverified images. For a strict
participating editor, it may refuse or ask for authorization.

### Owner authorization

For `require_authorization`, implement: - Owner identity or account
binding. - Short-lived, single-purpose authorization grants. - Grant
scope: exact asset, permitted operation and expiry. - Server-side
validation. - Replay protection with unique grant IDs. - Audit events.

Never expose a reusable owner secret in an image file or browser code.

------------------------------------------------------------------------

## 10. Backend API design

Suggested routes:

  Method   Route                                 Purpose
  -------- ------------------------------------- ----------------------------------
  POST     `/api/v1/protections`                 Upload and create protection job
  GET      `/api/v1/jobs/{job_id}`               Get processing status
  GET      `/api/v1/protections/{id}`            Get protection metadata
  GET      `/api/v1/protections/{id}/image`      Download protected image
  GET      `/api/v1/protections/{id}/manifest`   Download signed manifest
  POST     `/api/v1/verify`                      Verify image and manifest
  POST     `/api/v1/authorize`                   Issue scoped owner authorization
  POST     `/api/v1/revoke/{id}`                 Revoke a credential
  GET      `/api/v1/audit/{id}`                  Read authorized audit events

Suggested database entities:

### users

-   `id`
-   `email`
-   `created_at`
-   `status`

### assets

-   `id`
-   `owner_id`
-   `original_object_key`
-   `protected_object_key`
-   `original_sha256`
-   `protected_sha256`
-   `width`
-   `height`
-   `format`
-   `created_at`
-   `retention_expires_at`

### protections

-   `id`
-   `asset_id`
-   `policy`
-   `manifest_json`
-   `key_id`
-   `signature`
-   `status`
-   `expires_at`
-   `revoked_at`

### jobs

-   `id`
-   `asset_id`
-   `status`
-   `progress`
-   `error_code`
-   `created_at`
-   `completed_at`

### audit_events

-   `id`
-   `protection_id`
-   `event_type`
-   `decision`
-   `reason_code`
-   `created_at`

Store only the minimum data needed. Make retention and deletion controls
visible to users.

------------------------------------------------------------------------

## 11. Infrastructure and deployment

### 11.1 Local development

A developer machine can run: - React frontend. - FastAPI backend. -
PostgreSQL. - Redis. - Celery worker. - MinIO object storage. -
CPU-based image validation and manifest signing.

A GPU is optional for the first release because credential creation and
verification do not require deep-learning inference. A GPU becomes
useful for adversarial-defense experiments and model benchmarking.

### 11.2 Production architecture

``` text
Internet
   |
CDN / WAF / TLS
   |
Frontend hosting
   |
API gateway / FastAPI
   |
   +---- PostgreSQL
   |
   +---- Redis queue
   |
   +---- Object storage
   |
   +---- KMS / Secret manager
   |
Worker pool
   +---- CPU image validation
   +---- GPU research defense
   +---- Quality evaluation
```

### 11.3 Deployment options

Prototype: - Docker Compose on a developer workstation. - MinIO for
local object storage. - PostgreSQL and Redis containers. - Local signing
key for development only.

Small hosted pilot: - Frontend: Vercel or equivalent. - Backend: a
container platform. - Database: managed PostgreSQL. - Object storage:
S3-compatible storage. - Signing key: cloud KMS or secret manager. -
GPU: rented GPU instance or dedicated worker only when required.

Production: - Separate API, CPU worker and GPU worker services. -
Private object storage buckets. - Signed, short-lived download URLs. -
Queue limits and worker autoscaling. - KMS-managed signing keys and
rotation. - Monitoring, structured logs and alerting. - Backups and
tested restore procedure.

Do not put uploaded images in public buckets. Do not log image bytes,
private credentials or sensitive metadata.

------------------------------------------------------------------------

## 12. Security, privacy and abuse prevention

-   Enforce file size, dimensions and decoded-pixel limits.
-   Decode files in a restricted worker/container.
-   Use patched image libraries.
-   Reject malformed or unsupported files.
-   Rate-limit uploads and expensive GPU jobs.
-   Use authentication and authorization for private assets.
-   Use TLS in transit and encryption at rest.
-   Keep private signing keys outside application containers where
    possible.
-   Rotate keys and support key revocation.
-   Prevent path traversal and unsafe filenames.
-   Use random object keys rather than user filenames.
-   Use short-lived download links.
-   Define deletion and retention policies.
-   Do not claim that image protection establishes legal ownership.
-   Provide a way for the owner to revoke or change future policy
    credentials.

A user who already possesses an unprotected original can still share or
edit that original. AVERT protects the derivative it creates; it
cannot retroactively control copies already distributed.

------------------------------------------------------------------------

## 13. Testing and evaluation methodology

Build a benchmark before claiming effectiveness.

### 13.1 Test categories

  Category               Example test
  ---------------------- ----------------------------------------
  Inpainting             Remove an object
  Instruction editing    Change clothing or scene details
  Background editing     Replace the background
  Style transformation   Change the image style
  Image-to-image         Reconstruct a similar image
  Restoration            Denoise or sharpen the protected image
  Transformations        JPEG, resize, crop, rotate, screenshot

### 13.2 Baselines

Compare: - Original unprotected image. - Signed manifest only. -
Existing public defense baseline(s), where reproducible. - Your
experimental perturbation. - Your combined approach.

### 13.3 Metrics

  -----------------------------------------------------------------------
  Metric                              Purpose
  ----------------------------------- -----------------------------------
  SSIM                                Structural similarity

  PSNR                                Pixel reconstruction error

  LPIPS                               Learned perceptual distance

  DINO / CLIP feature similarity      Representation-level comparison

  Edit success rate                   Fraction of requested edits that
                                      succeed

  Target edit similarity              How closely output matches the
                                      requested edit

  Refusal accuracy                    Correct policy decisions by
                                      compatible editors

  False refusal rate                  Allowed edits incorrectly blocked

  Verification false acceptance       Invalid credentials incorrectly
                                      accepted

  Robustness retention                Protection effectiveness after
                                      transformations

  Latency and cost                    Practical product performance
  -----------------------------------------------------------------------

Define edit success with human review and task-specific criteria. A
lower CLIP score alone does not prove that an edit failed.

### 13.4 Experimental design

1.  Assemble a licensed or consented image dataset.
2.  Define a fixed set of edit instructions.
3.  Run each instruction against original images.
4.  Run the same instructions against protected images.
5.  Repeat across model families and versions.
6.  Include held-out models not used to develop the defense.
7.  Apply transformations to protected images and repeat tests.
8.  Have blinded human reviewers assess visual quality and edit
    outcomes.
9.  Report averages, confidence intervals and per-model results.
10. Publish failures and limitations, not only successful examples.

### 13.5 Minimum acceptance criteria for a prototype

These are proposed engineering gates, not claims of achieved
performance: - 100% correct signature verification in the test suite. -
100% refusal for valid `deny` credentials in the reference editor. - 0
invalid signatures accepted in negative tests. - No private key present
in frontend bundles or client responses. - Measured visual quality for
every protected output. - Baseline and defended edit success rates
reported separately. - Transformation and bypass tests included in the
report.

------------------------------------------------------------------------

## 14. Implementation phases

### Phase 1 --- Product skeleton (Week 1)

-   Create repository and Docker Compose setup.
-   Build React upload page.
-   Build FastAPI upload endpoint.
-   Add safe image validation and preview.
-   Save original files to private storage.
-   Create job and asset database records.

**Deliverable:** User can upload and preview an image.

### Phase 2 --- Policy and credential (Week 2)

-   Define manifest schema.
-   Implement canonical serialization.
-   Implement Ed25519 signing and verification.
-   Bind manifest to exported image SHA-256.
-   Add policy selection.
-   Add manifest download.

**Deliverable:** Protected image plus verifiable signed policy record.

### Phase 3 --- Compatible editor (Week 3)

-   Build a basic image-editing demo interface.
-   Add verification before the edit pipeline.
-   Refuse valid `deny` credentials.
-   Add owner-authorization flow.
-   Add verification status and audit log.

**Deliverable:** End-to-end explicit refusal in a cooperating editor.

### Phase 4 --- Research baseline (Weeks 4--5)

-   Select reproducible published baselines.
-   Set up a licensed evaluation dataset.
-   Select open image-editing models.
-   Define edit tasks and quality metrics.
-   Reproduce unprotected baseline performance.

**Deliverable:** Reproducible benchmark.

### Phase 5 --- Experimental defense (Weeks 6--8)

-   Implement an image-specific perturbation research pipeline.
-   Constrain changes using a visual-quality objective.
-   Evaluate against target and held-out model families.
-   Test compression, resizing, crop and denoising.
-   Compare with baseline defenses.

**Deliverable:** Experimental defense results with known limitations.

### Phase 6 --- Product integration (Weeks 9--10)

-   Add background processing queue.
-   Add result dashboard.
-   Add downloads and verification.
-   Add error handling, rate limits and retention.
-   Deploy a private pilot.

**Deliverable:** Demonstrable software product.

### Phase 7 --- Research report (Weeks 11--12)

-   Run final experiments.
-   Perform ablation studies.
-   Analyze failure cases.
-   Prepare methodology, results and limitations.
-   Conduct novelty and prior-art review before any patent claims.

**Deliverable:** Research paper/report and demo.

The schedule assumes a small, focused prototype and access to suitable
compute. Model benchmarking and robustness research may take longer.

------------------------------------------------------------------------

## 15. Suggested repository structure

``` text
pixelshield/
|
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- pages/
|   |   |-- services/
|   |   |-- hooks/
|   |   `-- types/
|   `-- package.json
|
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- models/
|   |   |-- schemas/
|   |   |-- services/
|   |   |   |-- image_validation.py
|   |   |   |-- manifest_service.py
|   |   |   |-- signing_service.py
|   |   |   `-- verification_service.py
|   |   `-- main.py
|   `-- requirements.txt
|
|-- workers/
|   |-- tasks/
|   |-- image_processing/
|   |-- defense/
|   `-- evaluation/
|
|-- compatible-editor/
|   |-- app/
|   |-- policy/
|   `-- tests/
|
|-- experiments/
|   |-- configs/
|   |-- datasets/
|   |-- baselines/
|   |-- results/
|   `-- notebooks/
|
|-- protocol/
|   |-- manifest-schema.json
|   |-- verification-protocol.md
|   `-- threat-model.md
|
|-- infra/
|   |-- docker/
|   |-- compose.yaml
|   `-- deployment/
|
|-- docs/
|   |-- architecture.md
|   |-- api.md
|   |-- evaluation.md
|   `-- privacy.md
|
`-- README.md
```

Do not commit datasets, private keys, uploaded user images, or large
model weights to the source repository.

------------------------------------------------------------------------

## 16. Example end-to-end user journey

1.  User opens AVERT.
2.  User uploads `portrait.png`.
3.  Backend validates and decodes the image.
4.  User chooses **Block AI editing**.
5.  User chooses whether to apply the experimental defense.
6.  Worker creates the exported derivative.
7.  Worker measures visual quality.
8.  Backend computes the exported image digest.
9.  Signing service signs the manifest.
10. User downloads `portrait_protected.png` and
    `portrait_protected.manifest.json`.
11. User submits both to the AVERT-compatible editor.
12. Editor verifies the signature and image binding.
13. Editor sees `ai_editing: deny`.
14. Editor refuses the edit and records the reason.
15. User can verify the credential later.

If the user uploads the protected image to a non-integrated third-party
editor, the signed policy may be ignored. The optional adversarial
defense may reduce editing success, but this must be measured for that
specific model and attack.

------------------------------------------------------------------------

## 17. Research novelty: where to focus

Avoid presenting the combination of watermarking, Glaze-like
perturbations and a web UI as the research novelty by itself.

Potential research contributions worth investigating:

1.  **Transformation-aware protection:** Evaluate and optimize defenses
    for realistic image transformations.
2.  **Cross-model generalization:** Test whether a defense transfers to
    editing architectures not used during optimization.
3.  **Policy-verifiable editing refusal:** Define an interoperable,
    signed restriction protocol for participating AI editors.
4.  **Quality-security trade-off:** Measure the Pareto frontier between
    human-perceived quality and editing resistance.
5.  **Adaptive threat-aware profiles:** Select protection profiles based
    on declared threat categories, with transparent limitations.
6.  **Removal-resilient evaluation:** Systematically measure how
    restoration and image-to-image reconstruction affect protection.

A strong paper should select one primary contribution and support it
with reproducible experiments. The credential protocol and adversarial
defense can be separate contributions with separate claims.

------------------------------------------------------------------------

## 18. Risks and limitations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Third-party AI ignores the          State integration requirement
  credential                          clearly; evaluate adversarial
                                      resistance separately

  Perturbation is removed             Test restoration and reconstruction
                                      attacks; report failure rates

  Image quality degrades              Add perceptual constraints and
                                      human evaluation

  False refusal                       Test allowed-policy cases and
                                      invalid/missing credentials

  Manifest gets separated             Offer embedded discovery metadata
                                      plus downloadable sidecar

  Image is transformed                Exact hash will fail; explore
                                      robust matching with explicit
                                      confidence and false-match tests

  Signing key is compromised          KMS, rotation, revocation and
                                      incident process

  User expects copyright enforcement  Explain that technical policy
                                      credentials are not a legal
                                      ownership determination
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 19. Recommended first milestone

Do not start by training a protection model.

Build this minimum vertical slice first:

-   React upload and preview.
-   FastAPI upload and job endpoint.
-   Private image storage.
-   A policy selector.
-   SHA-256 image binding.
-   Ed25519 signed manifest.
-   A small compatible editor that verifies the manifest and refuses
    `deny`.
-   A test suite for valid, invalid, expired, revoked and mismatched
    credentials.

This proves the complete product workflow and the explicit refusal
concept. Then add the adversarial defense as a separate research module
and test whether it provides meaningful resistance against
non-integrated editors.

------------------------------------------------------------------------

## 20. Final technical conclusion

AVERT is feasible as a research prototype and software product,
provided its claims are precise.

The strongest reliable mechanism is a **cooperative AI-editor
protocol**: the editor verifies a signed image policy and refuses
prohibited edits.

The most challenging research component is **non-cooperative adversarial
resistance**: making an image harder to edit even when the external AI
system does not know about AVERT. This is not guaranteed and must
be tested against model updates, transformations and adaptive attacks.

The product should therefore report two separate statuses:

-   **Policy enforcement:** verified refusal by a compatible editor.
-   **Adversarial resistance:** measured experimental resistance against
    specified models and attacks.

That separation makes the architecture technically honest, testable, and
suitable for serious research.


------------------------------------------------------------------------

## 22. Primary research foundation: ImageProtector (ACL 2026)

### 22.1 Selected base paper

**Shao, Z., Liu, H., Hu, Y., and Gong, N. Z. (2026). “Leave My Images
Alone: Preventing Multi-Modal Large Language Models from Analyzing
Images via Visual Prompt Injection.”** Proceedings of the 64th Annual
Meeting of the Association for Computational Linguistics (ACL 2026),
Long Papers, pp. 1588–1604.

- Official paper: https://aclanthology.org/2026.acl-long.72/
- DOI: https://doi.org/10.18653/v1/2026.acl-long.72
- Paper PDF: https://aclanthology.org/2026.acl-long.72.pdf
- Authors' code: https://github.com/Sadcardation/ImageProtector
- Method introduced in the paper: **ImageProtector**

This is AVERT's primary methodological starting point because it
investigates user-side image protection using carefully optimized,
near-imperceptible perturbations intended to make multimodal large
language models (MLLMs) refuse image-analysis requests. The paper
reports experiments across six MLLMs and four datasets and evaluates
countermeasures including Gaussian noise, DiffPure and adversarial
training.

**Important scope distinction:** ImageProtector addresses unauthorized
image *analysis* by MLLMs. It does not establish that an image cannot be
edited by generative image-editing systems. AVERT proposes to investigate
whether related adversarial-protection ideas can be adapted to image
editing tasks, alongside a separate signed-policy mechanism. This is a
research hypothesis, not an already-proven result.

### 22.2 Base-paper idea and method logic

The paper's high-level logic is:

1. A user starts with an ordinary image.
2. An optimization process creates a visually subtle perturbation.
3. The perturbation is designed to influence the target MLLM's visual
   processing so that it produces a refusal response to image-analysis
   questions.
4. The protected image is shared with the expectation that compatible
   tested MLLMs will be less able to analyze it as intended.
5. The authors evaluate refusal behaviour and image utility, and test
   selected defenses against the perturbation.

The paper's result is model- and setting-dependent. Its reported
refusals must not be interpreted as a universal property of image files
or as a guarantee against arbitrary models, editing pipelines or image
transformations.

### 22.3 How AVERT extends the base-paper direction

| Dimension | ImageProtector (base paper) | AVERT (proposed extension) |
|---|---|---|
| Main problem | Unauthorized MLLM image analysis | Unauthorized AI image editing |
| Primary adversarial goal | Induce refusal to analysis prompts | Investigate reduced success of specified edit instructions |
| Model family | Multimodal LLMs | Image-editing and image-generation pipelines, plus MLLMs where relevant |
| Policy handling | Perturbation-based behaviour | Signed machine-readable editing policy plus optional perturbation |
| Explicit refusal | Model-generated refusal behaviour | Deterministic refusal by an editor that verifies and enforces AVERT policy |
| Evaluation | Refusal rate, utility and countermeasures | Edit success, refusal correctness, visual quality and transformation robustness |

AVERT must not simply rename or reimplement ImageProtector. The
research contribution should be a carefully defined editing-specific
objective, a reproducible evaluation across editing tasks, and/or a
well-specified interoperable authorization protocol. A literature and
prior-art review is required before claiming novelty.

### 22.4 Proposed AVERT research hypothesis

**H1 — Editing resistance:** Under a defined set of image-editing
models, edit instructions and transformations, an AVERT perturbation
optimized for editing tasks may reduce the success of selected
unauthorized edits while maintaining acceptable perceptual quality.

**H2 — Policy enforcement:** An AI editor that verifies a valid AVERT
credential and implements its policy can reliably block an edit when
`ai_editing = deny`, independent of whether the optional adversarial
defense succeeds.

**H3 — Combined system:** Combining policy verification with an
editing-specific adversarial defense may provide stronger overall
protection than either mechanism alone, but the two mechanisms must be
evaluated separately as well as together.

These are hypotheses to test, not claims of achieved performance.

### 22.5 AVERT's proposed adversarial research workflow

```text
Original image + defined edit task(s)
                 |
                 v
       Select target edit models
                 |
                 v
  Generate candidate protected image
                 |
                 v
 Optimize perturbation against edit objective
                 |
                 v
 Constrain perceptual distortion / image quality
                 |
                 v
 Export protected derivative and evaluate
                 |
       +---------+----------+
       |                    |
       v                    v
 Run editing attacks     Apply transformations
 on protected image      (JPEG, resize, crop, etc.)
       |                    |
       +---------+----------+
                 |
                 v
 Measure edit success, quality and robustness
```

This is a proposed AVERT workflow, not a claim that the base paper
already provides an editing-optimization implementation. The research
team must choose the edit models and objective functions, establish
baselines, and validate the method experimentally. Start with a small
number of open-weight editing pipelines where reproducible evaluation
is possible. Do not assume gradients or internal access are available
for closed commercial APIs.

### 22.6 Suggested experiment design

- **Tasks:** object removal, object insertion, background replacement,
  attribute changes, style changes and instruction-guided edits.
- **Image groups:** consented/licensed images with varied scenes,
  subjects, resolutions and visual complexity.
- **Conditions:** original image; policy credential only; perturbation
  only; combined protection; and relevant baseline defenses where
  reproducible.
- **Transformations:** JPEG recompression at documented quality levels,
  resizing, cropping, mild blur, screenshots and image re-encoding.
- **Model split:** use development models to optimize the defense and
  held-out models to test transfer; report each model separately.
- **Review:** use blinded human assessment for visual quality and edit
  outcome, in addition to automated metrics.
- **Reporting:** publish failures, confidence intervals, model versions,
  prompts, settings and compute requirements.

Recommended measurements include edit success rate, task-specific
output similarity, LPIPS/SSIM/PSNR for image quality, human-rated
perceptual quality, perturbation magnitude, transformation robustness,
latency and compute cost. No single image-similarity metric proves that
an edit was prevented.

------------------------------------------------------------------------

## 23. Supporting literature and technical standards

These are supporting references, not substitutes for the primary base
paper. Their relevance differs by module:

1. **ImageProtector — adversarial visual prompt injection for image
   analysis.** Primary methodological starting point for AVERT's
   perturbation research. https://aclanthology.org/2026.acl-long.72/
2. **Glaze — style mimicry protection research.** Relevant background
   on perturbation-based protection of artists' work; its objective is
   not the same as AVERT's editing restriction objective.
   https://glaze.cs.uchicago.edu/
3. **Nightshade — data poisoning research.** Relevant as background on
   adversarially modified images and model-training risks; it is not a
   direct implementation of AVERT's per-image editing policy.
   https://nightshade.cs.uchicago.edu/
4. **C2PA Technical Specifications — content provenance and credentials.**
   Relevant to signed provenance and verifiable assertions; provenance
   metadata alone does not force an editor to refuse an edit.
   https://c2pa.org/specifications/
5. **Content Credentials.** Explanatory material on provenance and
   content history. https://contentcredentials.org/

### 23.1 Literature review questions

Before freezing the research proposal, investigate:

- What published work targets image editing specifically rather than
  image classification, captioning, VQA or general analysis?
- Which methods are white-box, transfer-based, black-box or
  query-based, and what access assumptions do they require?
- How do image-to-image diffusion editors respond to adversarial
  perturbations after preprocessing, latent encoding and denoising?
- Which transformations remove or weaken a defense?
- How should edit success and visual quality be measured without
  relying on one automated metric?
- What existing provenance, authorization or content-credential
  standards could be extended rather than duplicated?

------------------------------------------------------------------------

## 24. Updated project identity and research title

**Project/system name:** AVERT — Adversarial Visual Editing Restriction
Technology.

**Recommended research title:**

“AVERT: A Hybrid Framework for Restricting Unauthorized AI-Based Image
Manipulation Through Adversarial Protection and Cryptographic Policy
Enforcement.”

Use AVERT as the working system name. The formal title describes the
proposed mechanisms and should be revised if experiments show that one
of the mechanisms is not implemented or does not work as hypothesized.
The name and title do not establish patentability, novelty or trademark
availability. Conduct a formal literature, patent and trademark search
before making those claims.

------------------------------------------------------------------------

## 25. Base-paper implementation and attribution rules

- Read the full ImageProtector paper and its supplementary material
  before implementing its method.
- Review the authors' repository and license before reusing code,
  checkpoints or datasets.
- Attribute the paper in the report and clearly identify any reused
  implementation.
- Keep a reproducible baseline of the original method where feasible.
- Document every AVERT-specific change: target task, objective,
  constraints, optimization procedure, model access assumptions and
  evaluation protocol.
- Do not describe the base paper's analysis-refusal result as proof of
  editing resistance.
- Do not claim universal protection or guaranteed refusal by
  non-integrated third-party systems.


------------------------------------------------------------------------

## 26. Additional implementation references

-   ImageProtector (ACL 2026) --- https://aclanthology.org/2026.acl-long.72/
-   ImageProtector code --- https://github.com/Sadcardation/ImageProtector
-   Glaze --- https://glaze.cs.uchicago.edu/
-   Nightshade --- https://nightshade.cs.uchicago.edu/
-   C2PA --- https://c2pa.org/
-   Content Credentials --- https://contentcredentials.org/
-   PyTorch --- https://pytorch.org/
-   FastAPI --- https://fastapi.tiangolo.com/
-   OpenCV --- https://opencv.org/
-   Pillow --- https://python-pillow.org/
-   PostgreSQL --- https://www.postgresql.org/
-   Redis --- https://redis.io/
-   Celery --- https://docs.celeryq.dev/

Before finalizing the literature review, verify paper titles,
publication venues, versions and claims directly from the original
papers. Treat any preprint or project page as a starting point, not
proof of a universal security property.
