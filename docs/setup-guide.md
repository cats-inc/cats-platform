# Setup Guide

> Environment setup and installation instructions for `cats-inc`.

## Prerequisites

- Node.js 22+
- npm 11+
- `cats-runtime` running on `http://127.0.0.1:3110`

## Installation

### 1. Prepare the project

```bash
cd cats-inc
cp .env.example .env
```

### 2. Install dependencies

```bash
npm install
```

### 3. Verify installation

```bash
npm test
```

## Running the Project

### Local Run

```bash
npm run build
npm start
```

Open:

- `http://127.0.0.1:8181/health`
- `http://127.0.0.1:8181/api/app-shell`

## Common Issues

### Issue 1: `/health` returns `503`

**Solution**: Confirm `cats-runtime` is running and `CATS_RUNTIME_BASE_URL` is
correct.

### Issue 2: Runtime still unavailable even though `cats-runtime` is up

**Solution**: In phase 1, `cats-runtime` still depends on `agent-fleet`. Check
that both services are available.

---

*Last updated: 2026-03-11*
