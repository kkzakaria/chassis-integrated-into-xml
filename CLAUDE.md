# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VIN Generator - Chassis XML: A Next.js application that generates ISO 3779 compliant Vehicle Identification Numbers (VINs) and injects them into ASYCUDA XML templates for customs/logistics processing. Supports multi-instance deployment with unique sequence guarantees via Upstash Redis.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server at http://localhost:3000
pnpm build            # Production build
pnpm lint             # Run ESLint
```

## Architecture

### Core Layers

1. **VIN Generation Engine** (`lib/vin-generator.ts`)
   - `ChassisValidator` - VIN validation and checksum calculation (ISO 3779)
   - `VINGenerator` - Factory for creating VINs with format: `WMI(3) + VDS(5) + Checksum(1) + Year(1) + Plant(1) + Sequence(6)`
   - `ChassisFactory` - Unified API entry point for VIN generation with sequence management

2. **Sequence Management** (dual implementation)
   - `ChassisSequenceManager` - File-based persistence (`data/chassis_sequences.json`) for development
   - `KVSequenceManager` - Upstash Redis with atomic `INCR` for production uniqueness
   - `SequenceManagerFactory` - Auto-selects based on environment variables

3. **Service Layer** (`lib/vin-service.ts`)
   - `VINService` - Synchronous operations (dev)
   - `AsyncVINService` - Async wrapper for production/serverless

4. **XML Processing** (`lib/xml-template-service.ts`)
   - Reads templates from `xml-template/` directory
   - Injects VINs into `Marks2_of_packages` tags with "CH: " prefix
   - Injects into `Attached_document_reference` for codes 6122/6022

5. **Template Storage** (`lib/blob-template-storage.ts`)
   - Vercel Blob storage for templates in production (single source)
   - Filesystem for development only (`xml-template/`)

### API Routes

- `POST /api/generate` - Generates VINs and injects into XML template
- `GET /api/templates` - Lists available XML templates with position counts
- `POST /api/templates/upload` - Uploads a new XML template (to Blob in production)
- `POST /api/templates/migrate` - Migrates filesystem templates to Blob (protected)

### Data Flow

1. User selects template → API extracts position count from filename (e.g., "70-POSITIONS-...")
2. VINs generated with unique sequences → XML template processed
3. VINs injected into appropriate XML tags → File returned for download

## Environment Variables

| Variable | Required For |
|----------|--------------|
| `UPSTASH_REDIS_REST_URL` | Production (VIN sequences) |
| `UPSTASH_REDIS_REST_TOKEN` | Production (VIN sequences) |
| `BLOB_READ_WRITE_TOKEN` | Production (template storage) |
| `MIGRATION_SECRET` | Template migration API |

Without Redis variables, falls back to file-based sequences.

## Template Storage

**Production**: Vercel Blob only (single source of truth)
**Development**: Filesystem (`xml-template/`)

### Initial Migration

After configuring Vercel Blob, migrate existing templates:

```bash
curl -X POST https://your-app.vercel.app/api/templates/migrate \
  -H "Authorization: Bearer YOUR_MIGRATION_SECRET"
```

## VIN Format (ISO 3779)

- Positions 1-3: WMI (World Manufacturer ID)
- Positions 4-8: VDS (Vehicle Descriptor Section)
- Position 9: Check digit (calculated)
- Position 10: Year code (2001→"1", 2010→"A", 2025→"S")
- Position 11: Plant code
- Positions 12-17: Serial number (000001-999999)

**Forbidden characters:** I, O, Q (per ISO 3779)

## Key Files

- `lib/vin-generator.ts` - Core VIN generation logic (427 lines)
- `lib/xml-template-service.ts` - XML template injection using multiline regex
- `lib/blob-template-storage.ts` - Vercel Blob storage for template uploads
- `lib/template-validator.ts` - Template filename and content validation
- `app/page.tsx` - Main UI component (client-side)
- `components/template-upload.tsx` - Template upload component with drag-and-drop
- `data/chassis_sequences.json` - Persistent sequence state (dev)
