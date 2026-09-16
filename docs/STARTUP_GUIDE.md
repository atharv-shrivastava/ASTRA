# A.S.T.R.A. Startup Guide

A.S.T.R.A. is an offline-first React + Vite Progressive Web App prototype for SIH26062: Antarctic Supply Tracking & Resource Analytics.

This guide is written for a fresh Windows laptop and uses **pnpm** as the project package manager.

## 1. Prerequisites

Install these before cloning the project:

- Git for Windows
- Node.js LTS
- pnpm
- A modern Chromium-based browser such as Chrome or Edge for PWA installation and camera testing

After installation, open PowerShell and verify:

```powershell
git --version
node --version
pnpm --version
```

### Install pnpm

If pnpm is not already installed, the simplest Windows setup is:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

Then verify:

```powershell
pnpm --version
```

ASTRA declares pnpm as its package manager in `package.json`.

## 2. Clone the repository

Choose a folder where you keep development projects. For example:

```powershell
cd C:\
git clone https://github.com/atharv-shrivastava/ASTRA.git
cd ASTRA
```

Confirm that you are in the ASTRA repository:

```powershell
git remote -v
git branch --show-current
```

The main branch should be checked out.

## 3. Install dependencies

From the repository root:

```powershell
pnpm install
```

This installs the React/Vite toolchain plus ASTRA runtime dependencies such as Dexie, MessagePack, html5-qrcode, Chart.js, Tailwind CSS, and the Vite PWA plugin.

After installation, verify that `node_modules` was created:

```powershell
Test-Path .\node_modules
```

The command should print `True`.

## 4. Start the development server

Run:

```powershell
pnpm dev
```

Vite will print a local URL, normally similar to:

```text
http://localhost:5173/
```

Open that address in Chrome or Edge.

Keep the terminal running while developing. Stop the server with `Ctrl+C`.

## 5. What to test immediately

### Dashboard

Open the dashboard and verify that the application renders without console errors.

### Offline inventory

Add or modify an inventory item. The operation should be written locally through Dexie/IndexedDB and a mutation should enter the local sync queue.

### Predictor

Change personnel, temperature, stock, and Blizzard Mode. The depletion estimate and trajectory should update locally without requiring a network request.

### QR scanner

Open the cargo scanner on a device with camera access. Grant camera permission when prompted. Scan a JSON QR payload such as:

```json
{"id":"FUEL-092","name":"Jet-A1 Fuel Drum","qty":200,"unit":"Liters"}
```

The scanner should decode the payload and populate the cargo-entry workflow.

### Satellite sync

Use the sync control to package queued mutations. ASTRA serializes queued changes with MessagePack and reports the simulated compressed payload size.

The current prototype does not contact a real NCPOR server. The documented endpoint is a future integration boundary.

### Voyage planner

Open the HQ planning view and inspect the calculated 180-day shipment requirements for the configured stations.

## 6. Run a production build

When the development version works, test the production build:

```powershell
pnpm build
```

Then preview the generated build locally:

```powershell
pnpm preview
```

Vite will print another local URL. Open it in the browser.

The PWA service-worker behavior is intended to be validated from the production build/preview rather than assuming that development mode behaves exactly like an installed PWA.

## 7. Install ASTRA as a PWA

For Chrome/Edge:

1. Run the production preview.
2. Open the preview URL.
3. Look for the browser's install icon in the address bar or use the browser menu and choose the install option.
4. Confirm installation.
5. Launch ASTRA from the installed application shortcut.

For meaningful offline testing, install the PWA, load the application once while connected, then disconnect the network and reload it.

## 8. Test offline mode correctly

A useful offline test sequence is:

1. Start the app while online.
2. Open the main application screens once so the PWA shell is cached.
3. Add inventory or change a local resource value.
4. Enable Chrome DevTools.
5. In the Network panel, switch the connection to Offline.
6. Reload the installed/previewed application.
7. Confirm that the application shell still loads.
8. Confirm that locally stored inventory remains available.
9. Confirm that new mutations remain queued locally.
10. Restore network connectivity.
11. Trigger the sync workflow and confirm that queued entries move toward synced state in the prototype.

Important: service-worker caching and application data persistence are separate concerns. A cached HTML/CSS/JS shell does not automatically make remote APIs available offline.

## 9. Camera testing on a phone/tablet

Browser camera permissions are security-sensitive. `localhost` works for development on the same machine, but a phone accessing a development server over plain HTTP usually cannot use the camera unless the browser considers the origin secure.

For local tablet testing, use a secure development tunnel or a proper HTTPS deployment. Do not put production API secrets in Vite client-side environment variables.

## 10. Environment variables

The current frontend prototype is designed to run without secret environment variables.

When a real backend is introduced, keep secrets server-side. A future deployment may use environment variables for values such as the API base URL, but credentials and database secrets must never be bundled into browser JavaScript.

## 11. Project structure

```text
ASTRA/
├─ docs/
│  ├─ BACKEND_CONTRACT.md
│  └─ STARTUP_GUIDE.md
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ db/
│  ├─ engine/
│  ├─ modules/
│  ├─ types/
│  └─ main.tsx
├─ index.html
├─ package.json
├─ pnpm-workspace.yaml
├─ tailwind.config.js
├─ tsconfig.json
├─ vite.config.ts
└─ README.md
```

## 12. Useful development commands

```powershell
# Install/update dependencies
pnpm install

# Start development server
pnpm dev

# Run TypeScript/Vite production build
pnpm build

# Preview the production build
pnpm preview
```

## 13. Git workflow for contributors

Before starting work:

```powershell
git pull origin main
```

Create a feature branch:

```powershell
git checkout -b feat/your-feature-name
```

Check changes:

```powershell
git status
git diff
```

Commit:

```powershell
git add .
git commit -m "feat: describe the change"
```

Push:

```powershell
git push -u origin feat/your-feature-name
```

Then open a pull request on GitHub.

## 14. Common problems

### `pnpm` is not recognized

Install pnpm with Corepack:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

Close PowerShell, open a new PowerShell window, and run `pnpm --version` again.

### `git` is not recognized

Install Git for Windows and reopen PowerShell.

### Node.js version problems

Use a current Node.js LTS release. Then verify:

```powershell
node --version
pnpm --version
```

### Port 5173 is already in use

Vite will normally choose another available port. If you need to find the process using a port on Windows:

```powershell
netstat -ano | findstr :5173
```

### Camera does not start

Check browser camera permissions and ensure the page is served from a secure context appropriate for camera access. Test on HTTPS for remote/mobile devices.

### PWA installation option is missing

Use the production build with `pnpm build` followed by `pnpm preview`. Verify that the browser sees the generated web manifest and service worker. Development mode is not the right basis for judging installability.

### Data disappears

Check whether you are using the same browser origin. IndexedDB is scoped to the origin, so `http://localhost:5173` and another host/port are different storage locations.

### Offline shell loads but sync does not work

That is expected for the current prototype if the backend endpoint is unavailable. Offline-first means local reads/writes continue; it does not manufacture a satellite link out of optimism.

## 15. Current prototype boundary

The current repository implements the browser-side prototype and a documented backend contract. A real deployment still needs an authenticated backend, persistent central database, station identity/authorization, conflict resolution policy, secure transport, operational telemetry ingestion, and government/NCPOR infrastructure integration.

Do not describe the simulated sync endpoint or demo station values as a live production connection.
