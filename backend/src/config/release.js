// Which build is running.
//
// Without this, "is that bug fixed?" can only be answered by guessing. An
// error group records the release it was last seen in, so a fix can be
// confirmed — if nothing has arrived since the release that contains it, it is
// gone; if it arrives from a later one, it is not, whatever the commit message
// said.
//
// Most platforms inject a commit SHA already, so the common case needs no
// configuration at all.
const fromEnv = () =>
  process.env.APP_RELEASE
  || process.env.RENDER_GIT_COMMIT           // Render
  || process.env.RAILWAY_GIT_COMMIT_SHA      // Railway
  || process.env.VERCEL_GIT_COMMIT_SHA       // Vercel
  || process.env.GITHUB_SHA                  // GitHub Actions
  || process.env.SOURCE_VERSION              // Heroku
  || '';

// Short form — a full SHA is noise in a list.
export const APP_RELEASE = (fromEnv() || 'dev').slice(0, 12);

export const ENVIRONMENT = process.env.NODE_ENV || 'development';
