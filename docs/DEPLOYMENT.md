# Deploying HMS — Render + Atlas

**One service.** The root `Dockerfile` builds the React frontend and serves it
from the Express process, so the whole app is a single deployment on a single
URL.

| Piece | Host | Why |
| ----- | ---- | --- |
| App (SPA + API) | **Render** | Needs a long-lived process: one Mongoose pool, AsyncLocalStorage tenant context, in-process scheduler. None of that survives a serverless function. |
| Database | **MongoDB Atlas** | Already a replica set, so transactions work |
| Uploads | **S3-compatible bucket** | Render's filesystem is wiped on every deploy |

Total cost on the free tiers: **₹0** — with the caveats in [Free-tier limits](#free-tier-limits).

Because the browser only ever talks to its own origin, there is no CORS to
configure, no cross-origin cookie question, and no pair of URLs to keep in sync.
Most of what can go wrong in a two-host setup simply isn't there.

> **Prefer the frontend on a CDN?** Splitting it onto Vercel still works — see
> [Two-host setup](#appendix-two-host-setup-vercel--render) at the end. Start
> here unless you have a reason not to.

---

## 1. Object storage (do this first)

Uploaded patient documents, insurance claim files and the hospital logo must
not live on Render's disk — it is ephemeral, so a deploy deletes them. Any
S3-compatible bucket works.

**Cloudflare R2** is the cheapest fit (10 GB free, no egress charges):

1. Cloudflare dashboard → **R2** → *Create bucket* → name it `hms-uploads`.
2. **R2 → Manage API Tokens → Create API Token**, permission *Object Read & Write*.
3. Note the Access Key ID, Secret Access Key, and your Account ID.
4. Keep the bucket **private**. Files are streamed through the API, which
   applies the role checks — a public bucket would hand out patient documents
   to anyone with the URL.

AWS S3 and Backblaze B2 work identically; only `S3_ENDPOINT` / `S3_REGION` differ.

## 2. Atlas

**Network Access → Add IP Address → `0.0.0.0/0`.**

Render's outbound IP is not fixed on the free plan, so pinning a single
address is not possible. The database is still protected by its username and
password — but rotate them if they have ever been committed or shared.

Check the cluster is not **paused** (free M0 clusters pause after 60 days idle).

## 3. The app on Render

Render → **New → Blueprint** → select this repo. [`render.yaml`](../render.yaml)
defines the service; Render prompts for the secrets.

It builds the root [`Dockerfile`](../Dockerfile): the frontend is compiled in
one stage, then copied into the API image as `backend/public`, which is the
first place the server looks for a build. Both `backend/` and `frontend/` have
to be in the build context, which is why the Dockerfile lives at the root and
no `rootDir` is set.

> Setting up the service by hand instead? Choose **Docker** as the runtime and
> leave the root directory empty. Pointing it at `backend/` makes Render build
> `backend/Dockerfile`, which is API-only and has no frontend in it.

| Variable | Value |
| -------- | ----- |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | 32+ chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLIENT_URL` | This service's own URL, e.g. `https://hms.onrender.com` — no trailing slash |
| `S3_BUCKET` | `hms-uploads` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | From step 1 |
| `S3_ENDPOINT` | R2: `https://<account-id>.r2.cloudflarestorage.com` · AWS: leave unset |

`NODE_ENV`, `TRUST_PROXY`, `STORAGE_DRIVER` and `S3_REGION` are already set in
the blueprint.

`CLIENT_URL` is not doing CORS here — everything is same-origin — but a
password-reset email still needs an absolute link, so it has to be right.

> The server validates all of this at startup and **refuses to boot** on a weak
> `JWT_SECRET`, a wildcard `CLIENT_URL`, or `STORAGE_DRIVER=s3` with missing
> credentials. A failed deploy with a clear log line is the intended behaviour —
> read the log rather than working around it.

Once it is live, seed the first admin:

```bash
# Render dashboard → your service → Shell
npm run seed          # roles, departments, admin
npm run seed:fresh    # + demo data (skip this for a real hospital)
```

## 4. Post-deploy checks

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
# {"success":true,...,"data":{"uptime":12.3,"database":"up"}}
```

`"database":"down"` means Atlas is refusing the connection — almost always the
IP allowlist or a paused cluster.

Then, in the browser: sign in, upload a patient document, and download it back.
That one flow exercises Atlas, S3 and the auth chain together.

If this is an **existing** database being pointed at a new deployment, run the
slot-index migration once:

```bash
npm run migrate:slotday
```

---

## Troubleshooting

**Render: `failed to read dockerfile: open Dockerfile: no such file or directory`**
The service's root directory points somewhere without a Dockerfile. Clear it —
the Dockerfile is at the repository root and needs both `backend/` and
`frontend/` in its build context.

**The app loads but the page is blank, with a CSP error in the console**
`index.html` gained an inline script whose hash isn't allowed. The hash is
computed from the built file at startup, so this only happens if the build is
stale — rebuild rather than adding `'unsafe-inline'`.

**`/` returns `{"message":"HMS API"}` instead of the app**
The image has no frontend build in it. That's `backend/Dockerfile` (API-only),
not the root one — check which Dockerfile the service is building.

**Login returns 500, `/api/health` says `"database":"down"`**
Atlas is refusing the connection. Almost always the IP allowlist (`0.0.0.0/0`
needed for Render) or a paused M0 cluster.

**Render: the service boots then immediately exits**
Read the log — the startup validation names the exact variable. A `JWT_SECRET`
under 32 characters, a wildcard `CLIENT_URL`, and `STORAGE_DRIVER=s3` without
credentials each refuse to start on purpose.

**Uploads work, then files disappear after a deploy**
`STORAGE_DRIVER` is still `local`. See step 1.

## Free-tier limits

These are real constraints, not warnings to skim:

**The service sleeps after 15 minutes of inactivity.** The first request
afterwards takes 30–60 seconds while the container starts — and because this
one service also serves the frontend, that wait applies to opening the page at
all, not just to the first API call. Fine for a demo; not fine for a hospital
front desk. Render's Starter plan ($7/month) stays awake. (This is the one real
advantage of the two-host setup below: the page itself loads instantly from
Vercel's CDN while the API wakes up.)

**Appointment reminders will not run reliably.** The scheduler is an in-process
`setInterval`, and a sleeping service has no process. Drive it externally
instead — [cron-job.org](https://cron-job.org) (free), hitting:

```
POST https://YOUR-SERVICE.onrender.com/api/ops/reminders/run
Authorization: Bearer <a token for an admin account>
```

Hourly is enough. This also wakes the service, which shortens the next user's
cold start.

**Atlas M0 is 512 MB** and has no automated backups. Before real patient data,
move to at least M10 and turn on backups — losing a hospital's records to a
free-tier limit is not a recoverable mistake.

## Scaling past one instance

Two things assume a single process today, and both must change before running
two:

- **Rate limiting** is stored in memory, so each instance keeps its own budget.
  Move it to `rate-limit-redis`.
- **The reminder scheduler** would run once per instance, sending every patient
  duplicate reminders. Move it to BullMQ, or to an external cron as above.

Uploads are already on object storage, so that side scales as-is.

---

## Appendix: two-host setup (Vercel + Render)

Worth it for one reason: the frontend loads from a CDN and never sleeps, so the
page appears instantly even while the free-tier API is waking up. The cost is a
second dashboard and two URLs that have to agree.

1. Deploy the API to Render exactly as above. The image still contains the
   frontend; it just goes unused.
2. Vercel → **Add New → Project** → import this repo, and **leave Root
   Directory at the repository root**. The root [`vercel.json`](../vercel.json)
   builds the frontend out of `frontend/`.

   > This repo has no `package.json` at its root, so Vercel would otherwise
   > fail with *"Failed to locate `package.json` file in your project"*. The
   > explicit `installCommand` / `buildCommand` / `outputDirectory` in that file
   > are what tell it where to look. Setting Root Directory to `frontend`
   > instead also works — Vercel then reads
   > [`frontend/vercel.json`](../frontend/vercel.json) and ignores the root one.

3. In whichever of those two files applies, point the API rewrite at your
   Render URL:

   ```json
   { "source": "/api/:path*", "destination": "https://YOUR-SERVICE.onrender.com/api/:path*" }
   ```

   The proxy is what makes the client's relative `/api` base URL work, and it
   keeps requests same-origin so there is still no CORS involved. The catch-all
   rewrite below it is the SPA fallback; static files are matched before
   rewrites, so assets resolve on their own.

4. Set `CLIENT_URL` on Render to the **Vercel** origin, and redeploy.

The failure mode to watch for: the app loads but every request fails, because
the rewrite is still pointing at the placeholder host.
