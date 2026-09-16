# A.S.T.R.A.

Antarctic Supply Tracking & Resource Analytics for **SIH26062**.

ASTRA is an offline-first logistics and predictive asset-management PWA intended for Antarctic research operations at Maitri and Bharati, with a central planning workflow for NCPOR Goa.

## Current implementation

This repository contains a working frontend foundation for the SIH prototype:

- React + Vite + TypeScript
- Tailwind CSS dark polar interface
- Dexie.js / IndexedDB local persistence (`AstraLogDB`)
- Deterministic edge depletion predictor
- QR cargo scanning with `html5-qrcode`
- MessagePack sync-packet generation and offline queue simulation
- Chart.js stock-depletion visualization
- Station inventory and six-month voyage requirement calculation
- PWA/service-worker configuration through `vite-plugin-pwa`

The cloud API is intentionally represented as a documented boundary. No claim is made that `api.astra.ncpor.gov.in` exists; the prototype uses a local simulated sync flow until an approved backend endpoint is available.

## Run locally

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Architecture

```text
                 ┌─────────────────────────────┐
                 │ React/Vite PWA              │
                 │ Antarctic field tablet      │
                 └──────────────┬──────────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       Dexie / IndexedDB   QR Scanner       Edge Predictor
       inventory           html5-qrcode      deterministic JS
       syncQueue
             │                  │                  │
             └──────────────────┴──────────────────┘
                                │
                                ▼
                       MessagePack packet
                                │
                                ▼
                       Future sync API
                                │
                                ▼
                    NCPOR / Supabase backend
                                │
                                ▼
                         Goa Voyage Planner
```

## Predictor model

For a resource with a base daily burn rate per person:

```text
Base Daily Burn   = Base Rate Per Person × Occupants
TemperatureFactor = 1 + max(0, -20 - Temperature) × 0.015
BlizzardFactor    = 1.25 when Blizzard Mode is active, otherwise 1.0
Effective Burn    = Base Daily Burn × TemperatureFactor × BlizzardFactor
Days Remaining    = Current Stock / Effective Burn
```

The model is intentionally deterministic and explainable. Its values are prototype assumptions, not operational safety limits. Real deployment must use validated station procedures and engineering/medical thresholds.

## Backend contract

See `docs/BACKEND_CONTRACT.md` for the proposed FastAPI/Supabase interface, packet shape, idempotency requirements, and station/role considerations.

## Important safety note

This is a software prototype for the SIH problem statement. The depletion predictor must not be treated as a life-support decision authority. Production use would require validated domain parameters, redundancy, audit logging, authenticated synchronization, and operational approval.
