# Deploying HMS — Vercel + Render + Atlas

| Piece | Host | Why |
| ----- | ---- | --- |
| Frontend (Vite SPA) | **Vercel** | Static build on a CDN |
| Backend (Express) | **Render** | Needs a long-lived process: one Mongoose pool, AsyncLocalStorage tenant context, in-process scheduler. None of that survives a serverless function. |
| Database | **MongoDB Atlas** | Already a replica set, so transactions work |
| Uploads | **S3-compatible bucket** | Render's filesystem is wiped on every deploy |

Total cost on the free tiers: **₹0** — with the caveats in [Free-tier limits](#free-tier-limits).

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

## 3. Backend on Render

Render → **New → Blueprint** → select this repo. [`render.yaml`](../render.yaml)
defines the service; Render prompts for the secrets.

| Variable | Value |
| -------- | ----- |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | 32+ chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLIENT_URL` | Your Vercel origin, e.g. `https://hms.vercel.app` — no trailing slash |
| `S3_BUCKET` | `hms-uploads` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | From step 1 |
| `S3_ENDPOINT` | R2: `https://<account-id>.r2.cloudflarestorage.com` · AWS: leave unset |

`NODE_ENV`, `TRUST_PROXY`, `STORAGE_DRIVER` and `S3_REGION` are already set in
the blueprint.

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

## 4. Frontend on Vercel

Vercel → **Add New → Project** → import this repo, and **leave Root Directory
at the repository root** (the default). The root
[`vercel.json`](../vercel.json) builds the frontend out of `frontend/`.

> This repo has no `package.json` at its root — it holds `backend/` and
> `frontend/` side by side. Vercel would normally fail with
> *"Failed to locate `package.json` file in your project"*; the explicit
> `installCommand` / `buildCommand` / `outputDirectory` in the root
> `vercel.json` are what tell it where to look.
>
> If you would rather set **Root Directory** to `frontend`, that works too —
> Vercel then reads [`frontend/vercel.json`](../frontend/vercel.json) instead
> and ignores the root one. The two files are kept equivalent; whichever you
> use, the Render URL below has to be right **in that file**.

**Before the first deploy, replace the API host** with your actual Render URL:

```json
{ "source": "/api/:path*", "destination": "https://YOUR-SERVICE.onrender.com/api/:path*" }
```

This proxy is what makes the client's relative `/api` base URL work in
production. It also keeps every request same-origin, so there is no CORS
preflight and no third-party-cookie problem, and the backend URL never reaches
the browser.

The catch-all rewrite below it is the SPA fallback — React Router owns every
other path, and without it a hard refresh on `/patients/123` is a 404 from
Vercel. Static files are matched before rewrites, so assets still resolve.

Finally, set `CLIENT_URL` on Render to the Vercel URL and redeploy the backend.

## 5. Post-deploy checks

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

**Vercel: "Failed to locate `package.json` file in your project"**
Root Directory is set to something with no `package.json` and no build config.
Either clear it back to the repository root (the root `vercel.json` handles the
rest) or set it to `frontend`.

**The app loads but every request 404s or fails**
The `/api` rewrite still points at the placeholder Render URL. Fix the
`destination` in whichever `vercel.json` your Root Directory setting uses.

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

**The API sleeps after 15 minutes of inactivity.** The first request afterwards
takes 30–60 seconds while the container starts. Fine for a demo; not fine for a
hospital front desk. Render's Starter plan ($7/month) stays awake.

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
