# VIN Generator - Chassis XML

Générateur de numéros de châssis (VIN) ISO 3779 pour templates XML ASYCUDA.

## Fonctionnalités

- Génération de VINs conformes à la norme ISO 3779
- Injection automatique dans les templates XML ASYCUDA
- Interface web pour sélection de templates et configuration
- Gestion de l'unicité des séquences (fichier local ou Vercel KV)
- Support du mode clair/sombre

## Installation

```bash
pnpm install
```

## Développement

```bash
pnpm dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) dans le navigateur.

## Production avec Upstash Redis

Pour garantir l'unicité des VINs en production avec plusieurs instances serverless, configurez Upstash Redis via le Vercel Marketplace:

### 1. Créer une base Redis

1. Allez sur [Vercel Dashboard](https://vercel.com/dashboard)
2. Sélectionnez votre projet
3. Allez dans **Storage** > **Create Database**
4. Sélectionnez **Upstash** dans le Marketplace
5. Créez une base Redis

### 2. Variables d'environnement

Les variables seront automatiquement configurées:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### 3. Développement local

```bash
vercel env pull .env.local
```

## Variables d'environnement

| Variable | Description | Requis |
|----------|-------------|--------|
| `UPSTASH_REDIS_REST_URL` | URL de l'API REST Upstash | Production |
| `UPSTASH_REDIS_REST_TOKEN` | Token d'authentification | Production |

Sans ces variables, le système utilise un fichier local (`data/chassis_sequences.json`).

## Structure des VINs

| Position | Contenu | Exemple |
|----------|---------|---------|
| 1-3 | WMI (fabricant) | LZS |
| 4-8 | VDS (descripteur) | HCKZS |
| 9 | Checksum | 2 |
| 10 | Année | T (2030) |
| 11 | Code usine | S |
| 12-17 | Séquence unique | 000001 |

## API

### POST /api/generate

Génère des VINs et les injecte dans un template XML.

**Body:**
```json
{
  "template": "140-POSITIONS-1039-POIDS-TRICYCLE.xml",
  "wmi": "LZS",
  "vds": "HCKZS",
  "plantCode": "S"
}
```

**Response:**
```json
{
  "success": true,
  "xml": "...",
  "filename": "20260115_143000_140-POSITIONS-1039-POIDS-TRICYCLE.xml",
  "metadata": {
    "vinCount": 140,
    "sequenceManager": "kv"
  }
}
```

### GET /api/templates

Liste les templates XML disponibles.

## Licence

MIT
