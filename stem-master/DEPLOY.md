# Deploying Stem Master

Two things get deployed: the **separation server** (a Docker image that needs
an NVIDIA GPU to be practical) and the **iPhone app**. Deploy the server
first; the app is useless without one.

- [A. Server on a Hugging Face Space (GitHub workflow)](#a-server-on-a-hugging-face-space)
- [B. Server on any GPU host (Docker)](#b-server-on-any-gpu-host-docker)
- [C. Download the models ahead of time](#c-download-the-models-ahead-of-time)
- [D. iOS app: local build, TestFlight, App Store](#d-ios-app)
- [E. Pointing the app at the server](#e-pointing-the-app-at-the-server)
- [Troubleshooting](#troubleshooting)

Prices and console paths below were checked in November 2026. Both Hugging
Face and Apple change them; their pages win if they disagree with this file.

---

## A. Server on a Hugging Face Space

The workflow `.github/workflows/stem-master-space.yml` uploads
`stem-master/server` to a Hugging Face Space that uses the Docker SDK. Hugging
Face builds the image from `server/Dockerfile` and serves it at
`https://<owner>-<space-name>.hf.space`. The default Space is
`MpInDaHouse/stem-master`, which serves at
`https://mpindahouse-stem-master.hf.space`; that URL is also the app's
built-in default server.

### A1. Create a Hugging Face write token

1. Sign in at <https://huggingface.co> (the account or organization that should
   own the Space).
2. Open **Settings > Access Tokens** (<https://huggingface.co/settings/tokens>)
   and click **Create new token**.
3. Choose the **Write** token type, name it (for example `github-stem-master`)
   and create it. A fine-grained token also works if it has write access to
   repositories in the Space owner's namespace (and, for an organization, to
   that organization).
4. Copy the token (`hf_...`). It is shown once.

### A2. Add the secrets to GitHub

In the GitHub repository: **Settings > Secrets and variables > Actions > New
repository secret**.

| Secret | Required | Value |
|---|---|---|
| `HF_TOKEN` | yes | the write token from A1 |
| `STEM_MASTER_API_KEY` | no, recommended | a long random string; the server then rejects requests without `Authorization: Bearer <key>` |

Make an API key with either of:

```bash
openssl rand -hex 32
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Without an API key, anyone who finds the Space URL can run jobs on your GPU
(and your bill). With one, enter the same key in the app (section E).

### A3. Choose the hardware, and what it costs

Every tier except `cpu-basic` is billed per minute while the Space is starting
or running, and needs a **payment method** on the Hugging Face account or
organization that owns the Space: <https://huggingface.co/settings/billing>
(organizations: the organization's **Settings > Billing**). Builds are not
billed.

| Hardware | GPU | Price per hour | Notes |
|---|---|---|---|
| `cpu-basic` | none | free | 2 vCPU. Works, but a song takes hours. Sleeps after about 48 h idle. |
| `cpu-upgrade` | none | $0.03 | 8 vCPU. Still far too slow for real use. |
| `t4-small` | T4, 16 GB | $0.40 | Cheapest GPU. The workflow's default. |
| `t4-medium` | T4, 16 GB | $0.60 | More CPU and RAM, same GPU. |
| `l4x1` | L4, 24 GB | $0.80 | Newer, faster GPU. |
| `a10g-small` | A10G, 24 GB | $1.00 | |
| `a10g-large` | A10G, 24 GB | $1.50 | More CPU and RAM. |

The pipeline has not been benchmarked on these tiers in this repository;
`t4-small` is the cheapest one that runs every model.

**Sleep time** is how long a paid Space may sit idle before it goes to sleep
and stops billing. The workflow default is 3600 s (1 hour). The next request
wakes it, but that first job then waits for the container to start (and,
without storage, for the models to download again: see A6). `-1` means never
sleep, which bills around the clock: $0.40 x 24 x 30 = about $290 a month on
`t4-small`.

### A4. Run the workflow

1. GitHub: **Actions > Stem Master Space deploy > Run workflow**.
2. Inputs:
   - `space_id`: `owner/name`, default `MpInDaHouse/stem-master`. The token must
     be able to write to that owner.
   - `hardware`: see A3.
   - `private`: leave **off**. A private Space only answers requests that
     carry a Hugging Face token, which the app does not send. Protect the
     server with `STEM_MASTER_API_KEY` instead.
   - `sleep_time_seconds`: see A3. Ignored on `cpu-basic`.
3. The run:
   1. stops at once with *HF_TOKEN is not set* if the secret is missing;
   2. creates the Space if it does not exist (Docker SDK);
   3. uploads `stem-master/server` without `tests/`, `space/`, `deploy/` and
      caches, with `server/space/README.md` as the Space's `README.md` (its
      header sets `sdk: docker` and `app_port: 7860`). Files in the Space that
      are not in the repository are deleted, so edit the code here, not on
      Hugging Face;
   4. stores `STEM_MASTER_API_KEY` as a Space secret if that GitHub secret is
      set (an existing Space secret is left alone otherwise);
   5. requests the hardware and sleep time;
   6. waits (up to 45 minutes) for the build to finish and `/v1/health` to
      answer, and prints the server URL in the run summary.
4. If Hugging Face refuses the hardware (usually: no payment method), the run
   fails with an error that says so. The code is uploaded either way, and the
   Space keeps running on its previous hardware (`cpu-basic` for a new Space).
   Add the payment method and run the workflow again.
5. If the Space reports `BUILD_ERROR` or `RUNTIME_ERROR`, the run fails with a
   link to the build log (`https://huggingface.co/spaces/<owner>/<name>?logs=build`).

The first build takes a while: the image includes PyTorch with CUDA.

The same script runs from a laptop:

```bash
pip install "huggingface_hub>=0.24"
export HF_TOKEN=hf_...                    # write token
export STEM_MASTER_API_KEY=...            # optional
python stem-master/server/deploy/hf_space.py --space-id you/stem-master \
  --hardware t4-small --sleep-time 3600 --wait 2700
python stem-master/server/deploy/hf_space.py --dry-run   # list what would be uploaded
```

### A5. Check it

```bash
curl https://mpindahouse-stem-master.hf.space/v1/health
# {"status":"ok","version":"1.0.0","device":"cuda","queue_length":0,"auth_required":true}
```

`device` must be `cuda` on GPU hardware. If it says `cpu`, see
[GPU not used](#gpu-not-used).

### A6. Keep the models between restarts (optional)

A Space's own disk is wiped on every restart, wake-up and redeploy. The server
keeps jobs and models under `/data` when that directory is writable, so
without extra storage each restart re-downloads the models on the first job:
about 3.8 GB for the default options, 7.5 GB for all options.

To keep them, attach a Hugging Face **Storage Bucket** to the Space as a volume
mounted at **`/data`** (Space **Settings**; see
<https://huggingface.co/docs/hub/spaces-storage>). Buckets are billed
separately. The server then finds the models there after every restart.

---

## B. Server on any GPU host (Docker)

Any Linux machine (cloud VM, rented GPU box, workstation) with:

- an NVIDIA GPU and a recent NVIDIA driver (`nvidia-smi` works);
- Docker and the NVIDIA Container Toolkit
  (<https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html>);
  check with `docker run --rm --gpus all ubuntu nvidia-smi`.

### B1. Get the image

The **Stem Master server** workflow pushes the image on every push to `main`
(and when run by hand with *publish* ticked):

```
ghcr.io/shaunroohi-alt/stem-master-server:latest
ghcr.io/shaunroohi-alt/stem-master-server:<commit sha>
```

If the package is private (new packages usually start private), either make it
public (GitHub: your profile > **Packages > stem-master-server > Package
settings > Change visibility**), or log in on the host with a personal access
token that has `read:packages`:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

Or build it on the host: `docker build -t stem-master-server stem-master/server`.

### B2. Run it

```bash
docker volume create stem-models
docker run -d --name stem-master --restart unless-stopped \
  --gpus all -p 7860:7860 \
  -v stem-models:/data \
  -e STEM_MASTER_API_KEY="$(openssl rand -hex 32)" \
  ghcr.io/shaunroohi-alt/stem-master-server:latest

docker exec stem-master printenv STEM_MASTER_API_KEY   # the key to enter in the app
curl http://localhost:7860/v1/health                   # "device":"cuda"
docker logs -f stem-master
```

- `/data` holds jobs (`/data/jobs`, deleted after 24 h) and models
  (`/data/models`). The named volume keeps them across container upgrades.
  With a host directory instead of a named volume, make it writable by uid
  1000 first (`sudo chown 1000:1000 /srv/stem-master`).
- Other settings (`STEM_MASTER_MAX_UPLOAD_MB`, `STEM_MASTER_MAX_DURATION_S`,
  `STEM_MASTER_JOB_TTL_HOURS`, `STEM_MASTER_WORKERS`, ...) are listed in
  SPEC section 5. Pass them with `-e`.
- Upgrade: `docker pull ghcr.io/shaunroohi-alt/stem-master-server:latest`,
  then `docker rm -f stem-master` and the same `docker run`.

### B3. Put HTTPS in front

iOS allows plain `http://` only to servers on the local network. A server on
the internet needs HTTPS. The simplest options:

- **Caddy** on the host (gets and renews a certificate automatically; point a
  DNS name at the host first):
  ```bash
  caddy reverse-proxy --from stems.example.com --to localhost:7860
  ```
- **Cloudflare Tunnel** (no open ports):
  `cloudflared tunnel --url http://localhost:7860`. Cloudflare caps request
  bodies at 100 MB on its Free and Pro plans, so lower
  `STEM_MASTER_MAX_UPLOAD_MB` to 100 to get a clear error instead of a failed
  upload.
- **nginx**: raise the body limit, which defaults to 1 MB, to above the upload
  limit, and allow long transfers:
  ```nginx
  client_max_body_size 210m;
  proxy_read_timeout 300s;
  proxy_request_buffering off;
  ```

Then keep port 7860 closed to the outside and use
`https://stems.example.com` as the server URL.

### B4. CPU-only image

For testing without a GPU (slow):

```bash
docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu \
  -t stem-master-server:cpu stem-master/server
docker run -p 7860:7860 -v stem-models:/data stem-master-server:cpu
```

---

## C. Download the models ahead of time

Models download automatically the first time a job needs them, which makes
that job slow. Fetch them up front into the same `/data` volume the server
uses:

```bash
# all models (about 7.5 GB); or --quality max / --quality fast
docker run --rm -v stem-models:/data ghcr.io/shaunroohi-alt/stem-master-server:latest \
  python -m stem_master prefetch --quality all
```

Without Docker, from `stem-master/server` with the server's environment:

```bash
STEM_MASTER_MODEL_DIR=/srv/stem-master/models python -m stem_master prefetch --quality all
```

`max` fetches what Max quality uses, `fast` what Fast quality uses, `all`
both. On a Hugging Face Space there is no shell to run this in; the models
download on the first job, and stay only if `/data` is a storage volume (A6).

---

## D. iOS app

The project is generated by XcodeGen from `stem-master/ios/project.yml`;
`StemMaster.xcodeproj` is not committed.

### D1. Build and run locally with Xcode

Needs a Mac with the current Xcode from the App Store.

```bash
brew install xcodegen
cd stem-master/ios
xcodegen generate
open StemMaster.xcodeproj
```

1. Select the **StemMaster** target > **Signing & Capabilities**, tick
   *Automatically manage signing* and choose your **Team**. A free Apple ID
   (personal team) can run the app on your own iPhone; the install expires
   after 7 days.
2. If Xcode says the bundle identifier `com.mpaudio.stemmaster` is not
   available, it is registered to another team: change
   `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml` (for example to
   `com.<you>.stemmaster`) and run `xcodegen generate` again.
3. Pick a simulator or your iPhone and press Run.

Run the unit tests (they decode `stem-master/contract/job_completed.json`):

```bash
xcodebuild test -project StemMaster.xcodeproj -scheme StemMaster \
  -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

(Use any iPhone simulator that `xcrun simctl list devices available` shows;
CI picks the newest one automatically.)

Bake a different default server into a build:

```bash
xcodebuild ... STEM_MASTER_SERVER_URL=https://stems.example.com
```

Do not edit the generated project by hand; change `project.yml` and
regenerate.

### D2. TestFlight through the workflow

The **Stem Master iOS** workflow, run by hand with *testflight* ticked, runs the
tests, then archives a Release build, signs it with cloud-managed certificates
and uploads it to App Store Connect.

**One-time setup**

1. **Apple Developer Program** membership ($99 a year):
   <https://developer.apple.com/programs/>.
2. **Team ID**: <https://developer.apple.com/account> > **Membership
   details** > *Team ID* (10 characters).
3. **App ID**: **Certificates, Identifiers & Profiles > Identifiers > +** >
   *App IDs* > *App* > Bundle ID `com.mpaudio.stemmaster` (explicit). No extra
   capabilities are needed.
4. **App record**: <https://appstoreconnect.apple.com> > **Apps > + > New App**:
   platform iOS, a name (App Store names are unique; if "Stem Master" is
   taken, use e.g. "Stem Master by MP Audio"), primary language, the bundle ID
   from step 3, and any SKU (e.g. `stem-master`). Uploads fail until this
   record exists.
5. **App Store Connect API key**: App Store Connect > **Users and Access >
   Integrations > App Store Connect API > Team Keys > +** (first time: request
   access). Name it `GitHub Actions` and give it the **Admin** role. Admin is
   required: the workflow uses `-allowProvisioningUpdates`, which asks Apple to
   create the distribution certificate and provisioning profile on the fly
   (cloud-managed signing), and lower roles may not do that. Download the
   `AuthKey_<KEYID>.p8` file (you can download it only once), and note the
   **Key ID** and the **Issuer ID** shown above the key list.
6. **At least one registered iPhone** in **Certificates, Identifiers &
   Profiles > Devices** (running the app once from Xcode on your iPhone, D1,
   registers it). Automatic signing creates a development profile while
   archiving, and Apple does not issue one for a team with no devices.
7. GitHub repository secrets (**Settings > Secrets and variables > Actions**):

| Secret | Value |
|---|---|
| `APPLE_TEAM_ID` | Team ID from step 2 |
| `ASC_KEY_ID` | Key ID from step 5 |
| `ASC_ISSUER_ID` | Issuer ID from step 5 |
| `ASC_PRIVATE_KEY` | the whole contents of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

**Each release**

1. **Actions > Stem Master iOS > Run workflow**, tick **testflight**.
   Optionally set **server_url** to bake a different default server into this
   build (empty keeps `project.yml`'s
   `https://mpindahouse-stem-master.hf.space`).
2. The run fails straight away, naming the missing secrets, if any are unset.
   Otherwise it builds with version `1.0` (`MARKETING_VERSION` in
   `project.yml`) and build number = the workflow run number, and uploads.
   Raise `MARKETING_VERSION` in `project.yml` for each new App Store version.
3. Apple processes the build (usually 5 to 30 minutes), then it shows under
   **TestFlight** in App Store Connect. Add internal testers (members of your
   App Store Connect team) to test right away; external testers need a Beta
   App Review first.
4. Export compliance is already answered: `Info.plist` sets
   `ITSAppUsesNonExemptEncryption` to false (the app uses only standard HTTPS).

### D3. App Store Connect checklist before submitting for review

- [ ] **App information**: name, subtitle, category (*Music*), content rights
      (the app processes files the user supplies).
- [ ] **Privacy policy URL** (required). It must say that audio files the user
      imports are uploaded to the separation server for processing, kept there
      for at most 24 hours and then deleted, and not used for anything else.
      Name who runs the server.
- [ ] **Screenshots**: iPhone 6.9-inch display (1320 x 2868 portrait) or
      6.5-inch (1284 x 2778); App Store Connect scales them for smaller
      iPhones. Library, options sheet, processing and mixer make a good set.
- [ ] **Description, keywords, support URL** (and marketing URL, optional).
- [ ] **Age rating** questionnaire: no objectionable content, so 4+.
- [ ] **App Privacy** ("privacy nutrition label"), *Get Started*:
  - Data collected: **Yes**.
  - **User Content > Audio Data**: purpose **App Functionality**; **not linked**
    to the user's identity; **not used for tracking**. (Uploaded tracks are
    stored on the server until the job expires, which counts as collection.)
  - The app also sends a random per-install ID (`X-Client-Id`) so the server
    can list that install's jobs. The conservative declaration is
    **Identifiers > Device ID**, App Functionality, not linked, no tracking.
  - No analytics, advertising or crash-reporting SDKs are included.
- [ ] **App Review information**: a contact, and notes saying that the app
      sends audio to its server for separation; include the API key if the
      server requires one. Make sure the server is up while the review runs:
      set the Space's sleep time to `-1` (or keep it warm) for those days, since
      a cold start can make the first job look broken.
- [ ] **Pricing and availability**.
- [ ] Select the TestFlight build under the version, then **Add for Review**.

---

## E. Pointing the app at the server

The app's default server comes from the build setting `STEM_MASTER_SERVER_URL`
(`project.yml`, default `https://mpindahouse-stem-master.hf.space`), which ends
up in `Info.plist` as `SMDefaultServerURL`. To change it:

- **Per device, no rebuild**: in the app, **Settings > Server**: enter the
  server URL and, if the server has `STEM_MASTER_API_KEY` set, the same key
  under *API key*. The key is stored in the iOS Keychain. **Test Connection**
  shows what the server reports: device (GPU or CPU, with a warning on CPU),
  server version, jobs in the queue and whether a key is required. **Use
  Default Server** switches back to the built-in URL.
- **For a build**: the TestFlight workflow input `server_url`, or
  `STEM_MASTER_SERVER_URL=https://...` on the `xcodebuild` command line, or
  edit `project.yml`.

Server URLs:

| Server | URL to enter |
|---|---|
| Hugging Face Space | `https://<owner>-<space-name>.hf.space` (lowercase; `_` and `.` become `-`) |
| GPU host behind HTTPS (B3) | `https://stems.example.com` |
| A machine on the same Wi-Fi | `http://192.168.1.20:7860` (iOS asks for Local Network permission the first time) |

Plain `http://` works only for local-network addresses; anything else must be
HTTPS.

---

## Troubleshooting

### GPU not used

`/v1/health` says `"device":"cpu"` on a GPU machine.

- Docker: the container must be started with `--gpus all` and the NVIDIA
  Container Toolkit installed. Check with
  `docker run --rm --gpus all ubuntu nvidia-smi`.
- Driver too old for the PyTorch build: check what the image has with
  ```bash
  docker exec stem-master python -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())"
  ```
  and compare `torch.version.cuda` with the *CUDA Version* `nvidia-smi` prints
  on the host. If the host's is lower, update the driver, or rebuild with a
  matching wheel index, for example:
  ```bash
  docker build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu126 \
    -t stem-master-server stem-master/server
  ```
  On a Hugging Face Space, set a Space **variable** `TORCH_INDEX_URL` to that
  URL (variables are passed to the Docker build as build arguments) and
  rebuild the Space (Settings > *Factory reboot*).

### Uploads fail with 413

The file is larger than `STEM_MASTER_MAX_UPLOAD_MB` (200 MB), or a reverse
proxy in front has a lower body limit (nginx: `client_max_body_size`).

### The app says 401 / unauthorized

The server has `STEM_MASTER_API_KEY` set and the app's key differs. Enter the
same key in **Settings > Server > API key**. On a Space, the key is the
`STEM_MASTER_API_KEY` secret in the Space settings (or the GitHub secret it was
deployed from).

### The first job after a while takes much longer

The Space was asleep (container start) and, without a storage volume, had to
download the models again. See A3 (sleep time) and A6 (storage).

### Workflow errors

| Message | Fix |
|---|---|
| *HF_TOKEN is not set* | Add the secret (A2). |
| *Hugging Face rejected the request ... HTTP 401/403* | The token is read-only, expired, or cannot write to that owner. Create a Write token (A1). |
| *Hugging Face refused hardware ...* | Add a payment method (A3), then re-run. |
| *The Space reported BUILD_ERROR* | Open the build log link from the error. |
| *Missing TestFlight secrets: ...* | Add the listed secrets (D2 step 7). |
| `xcodebuild archive`: *Your team has no devices from which to generate a provisioning profile* | Register an iPhone (D2 step 6). |
| `xcodebuild archive`: *No profiles for 'com.mpaudio.stemmaster' were found* or a certificate error | The API key is not Admin, or the App ID / app record does not exist yet (D2 steps 3 to 5). |
| Contract fixture check fails in *Stem Master server* | The API output changed. Run the server tests locally (`STEM_MASTER_ENGINE=fake python -m pytest` in `stem-master/server`) and commit `stem-master/contract/` together with any matching iOS change. |
