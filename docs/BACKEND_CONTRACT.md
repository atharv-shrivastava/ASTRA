# ASTRA backend contract

This document defines the boundary between the offline field client and a future authenticated backend. It is intentionally a contract rather than an implementation because SIH26062 does not provide an operational government API for this prototype.

## Goals

The backend must accept compact, idempotent synchronization packets from station devices, validate station permissions, persist inventory mutations, and expose read-only aggregates for the Goa HQ voyage planner.

## Proposed endpoint

`POST /api/v1/sync`

Authentication should use a device-bound credential or an approved government identity mechanism. The browser prototype must not embed a permanent secret.

### Request

```json
{
  "protocolVersion": 1,
  "deviceId": "MAITRI-TAB-07",
  "stationId": "MAITRI",
  "packetId": "6f1f8d1f-7db0-4a92-a2e0-0a3b1d7c11e8",
  "encoding": "msgpack",
  "createdAt": 1790000000000,
  "mutations": [
    {
      "mutationId": "f1c75c30-70d4-4aa4-9cb0-dc5a2c23f1f4",
      "entity": "inventory",
      "operation": "upsert",
      "entityId": "FUEL-092",
      "payload": {
        "id": "FUEL-092",
        "station": "Maitri",
        "resourceType": "fuel",
        "name": "Jet-A1 Fuel Drum",
        "quantity": 200,
        "unit": "L",
        "updatedAt": 1790000000000
      }
    }
  ]
}
```

The production transport can carry the MessagePack bytes directly. JSON above is the human-readable logical model.

## Idempotency

`mutationId` must be unique per client mutation. The server must treat a repeated `mutationId` as an already-applied operation rather than applying it twice. This is mandatory because a satellite connection can disappear after the server commits but before the client receives the acknowledgement.

## Response

```json
{
  "protocolVersion": 1,
  "packetId": "6f1f8d1f-7db0-4a92-a2e0-0a3b1d7c11e8",
  "accepted": ["f1c75c30-70d4-4aa4-9cb0-dc5a2c23f1f4"],
  "rejected": [],
  "serverTime": 1790000001400
}
```

The client should remove only acknowledged mutations from `syncQueue`.

## PostgreSQL/Supabase data model

A future backend can use these logical tables:

- `stations`: station identity, region, active/inactive state.
- `devices`: device registration and station binding.
- `inventory`: current server-side inventory snapshot per station/resource.
- `inventory_mutations`: immutable audit history keyed by `mutation_id`.
- `voyage_manifests`: generated annual shipment plans.
- `sync_sessions`: packet-level transmission/audit metadata.

Supabase/PostGIS is useful if later requirements include geospatial station data, route planning, or regional map layers. It is not needed for the local prediction engine.

## FastAPI services

Suggested modules:

```text
backend/
  app/
    main.py
    api/
      sync.py
      inventory.py
      stations.py
      voyage.py
    domain/
      models.py
      validation.py
      idempotency.py
    db/
      session.py
      repositories.py
```

The backend should validate quantities, resource types, station-device ownership, timestamps, and protocol version before persisting a mutation.

## Role model

The design should distinguish at least:

- `station_operator`: may read and mutate inventory for their assigned station.
- `hq_planner`: may read cross-station inventory and generate voyage manifests.
- `administrator`: may manage stations, devices, thresholds, and access policy.

The browser field client should never rely on a UI-only station selector as an authorization control. Station permissions belong on the backend.

## Conflict policy

Do not silently overwrite newer server state. A production implementation should use `updatedAt` plus a monotonic server-side version or revision number. For conflicting quantity edits, preserve both audit events and surface the conflict for human resolution.

## Security and resilience requirements

Production deployment requires TLS, authentication, device registration, replay protection, audit logs, clock-skew handling, input limits, and explicit retry/backoff behavior. Compression is an optimization, not a security control.
