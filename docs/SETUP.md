# Setup Guide

## 1. Prerequisites
- Node.js 18+ and npm
- MongoDB 6/7 (local, Docker, or Atlas)

## 2. MongoDB via Docker (optional)
```bash
docker run -d --name hms-mongo -p 27017:27017 -v hms-mongo-data:/data/db mongo:7
# stop / start later:
docker stop hms-mongo
docker start hms-mongo
```

## 3. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run seed    # roles + departments + admin user
npm run dev     # nodemon, http://localhost:5000
```

Verify:
```bash
curl http://localhost:5000/api/health
```

## 4. Frontend
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

Build for production:
```bash
npm run build
npm run preview
```

## 5. Default Credentials
`admin@hms.local` / `Admin@123` (SUPER_ADMIN). Change via `SEED_ADMIN_*` in `.env`
before seeding, or update the user later.

## 6. Common Issues
- **`ECONNREFUSED 127.0.0.1:27017`** → MongoDB is not running. Start it (see step 2).
- **401 on every request** → token expired or missing; log in again.
- **CORS errors** → in dev, use the Vite proxy (call `/api/...`, not `http://localhost:5000`).
