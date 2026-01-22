# Roadmap - VIN Generator

Ce document décrit les fonctionnalités planifiées pour le projet VIN Generator. Chaque fonctionnalité est détaillée avec son niveau de complexité, les fichiers à créer/modifier, et les dépendances éventuelles.

---

## Table des matières

1. [Fonctionnalités faciles](#-fonctionnalités-faciles)
   - [1.1 Supprimer un template](#11-supprimer-un-template)
   - [1.2 Prévisualisation template](#12-prévisualisation-template)
   - [1.3 Historique des VINs générés](#13-historique-des-vins-générés)
   - [1.4 Export CSV](#14-export-csv)
   - [1.5 Thème personnalisé](#15-thème-personnalisé)

2. [Fonctionnalités moyennes](#-fonctionnalités-moyennes)
   - [2.1 Validation de VIN](#21-validation-de-vin)
   - [2.2 Génération par lot](#22-génération-par-lot)
   - [2.3 Recherche de templates](#23-recherche-de-templates)
   - [2.4 Dashboard statistiques](#24-dashboard-statistiques)
   - [2.5 Mode hors-ligne (PWA)](#25-mode-hors-ligne-pwa)

3. [Fonctionnalités complexes](#-fonctionnalités-complexes)
   - [3.1 Authentification](#31-authentification)
   - [3.2 API publique avec clés](#32-api-publique-avec-clés)
   - [3.3 Gestion des séquences](#33-gestion-des-séquences)
   - [3.4 Multi-tenant](#34-multi-tenant)
   - [3.5 Webhooks](#35-webhooks)

4. [Priorités suggérées](#priorités-suggérées)

---

## 🟢 Fonctionnalités faciles

### 1.1 Supprimer un template

**Description:** Permettre aux utilisateurs de supprimer un template depuis l'interface.

**Complexité:** 🟢 Facile

**Fichiers à créer:**
- `app/api/templates/[filename]/route.ts` - API DELETE

**Fichiers à modifier:**
- `lib/blob-template-storage.ts` - Ajouter fonction de suppression (déjà existante)
- `app/page.tsx` - Ajouter bouton de suppression dans la liste

**Interface proposée:**
```
[Template dropdown] [🗑️]
```

**Points d'attention:**
- Demander confirmation avant suppression
- Ne pas permettre de supprimer si c'est le dernier template

**Estimation:** ~2h

---

### 1.2 Prévisualisation template

**Description:** Afficher un aperçu du template avant de générer les VINs.

**Complexité:** 🟢 Facile

**Fichiers à créer:**
- `app/api/templates/[filename]/preview/route.ts` - API GET pour aperçu
- `components/template-preview.tsx` - Modal de prévisualisation

**Fichiers à modifier:**
- `app/page.tsx` - Ajouter bouton "Aperçu"

**Informations à afficher:**
- Nombre de positions
- Poids
- Type de véhicule
- Taille du fichier
- Date d'upload
- Extrait XML (premières lignes)

**Estimation:** ~3h

---

### 1.3 Historique des VINs générés

**Description:** Conserver un historique des générations récentes.

**Complexité:** 🟢 Facile

**Option A - localStorage (simple):**
- Stockage côté client
- Limité à 50 dernières générations
- Pas de persistance entre appareils

**Option B - Base de données (avancé):**
- Vercel Postgres ou Upstash Redis
- Historique partagé
- Recherche et filtres

**Fichiers à créer (Option A):**
- `lib/history-storage.ts` - Service localStorage
- `components/generation-history.tsx` - Composant d'affichage

**Fichiers à modifier:**
- `app/page.tsx` - Intégrer l'historique

**Données à stocker:**
```typescript
interface GenerationRecord {
  id: string;
  timestamp: Date;
  template: string;
  vinCount: number;
  vins: string[];
  config: { wmi, vds, year, plantCode };
}
```

**Estimation:** ~3h (Option A), ~6h (Option B)

---

### 1.4 Export CSV

**Description:** Permettre l'export des VINs générés au format CSV.

**Complexité:** 🟢 Facile

**Fichiers à modifier:**
- `app/page.tsx` - Ajouter bouton "Télécharger CSV"

**Format CSV proposé:**
```csv
Index,VIN,WMI,VDS,Year,PlantCode,Sequence
1,LZS12345678901234,LZS,12345,2025,S,000001
2,LZS12345678901235,LZS,12345,2025,S,000002
```

**Implémentation:**
```typescript
function downloadCSV(vins: string[], config: Config) {
  const csv = vins.map((vin, i) => `${i+1},${vin},...`).join('\n');
  // Créer blob et télécharger
}
```

**Estimation:** ~1h

---

### 1.5 Thème personnalisé

**Description:** Permettre de personnaliser les couleurs de l'interface.

**Complexité:** 🟢 Facile

**Fichiers à créer:**
- `components/theme-customizer.tsx` - Sélecteur de couleurs

**Fichiers à modifier:**
- `app/globals.css` - Variables CSS pour les couleurs
- `lib/theme-storage.ts` - Persistance localStorage

**Thèmes proposés:**
- Défaut (bleu)
- Vert
- Violet
- Orange
- Mode entreprise (gris)

**Estimation:** ~2h

---

## 🟡 Fonctionnalités moyennes

### 2.1 Validation de VIN

**Description:** Outil pour vérifier si un VIN existant est valide selon ISO 3779.

**Complexité:** 🟡 Moyen

**Fichiers à créer:**
- `app/validate/page.tsx` - Page de validation
- `app/api/validate/route.ts` - API de validation
- `components/vin-validator.tsx` - Formulaire de validation

**Fichiers à modifier:**
- `lib/vin-generator.ts` - Exposer la fonction de validation (déjà existante dans ChassisValidator)

**Informations retournées:**
```typescript
interface ValidationResult {
  valid: boolean;
  wmi: string;
  vds: string;
  checkDigit: string;
  expectedCheckDigit: string;
  year: number;
  plantCode: string;
  sequence: string;
  errors: string[];
}
```

**Estimation:** ~4h

---

### 2.2 Génération par lot

**Description:** Générer plusieurs fichiers XML en une seule opération.

**Complexité:** 🟡 Moyen

**Fichiers à créer:**
- `app/api/generate/batch/route.ts` - API de génération par lot
- `components/batch-generator.tsx` - Interface de sélection multiple

**Fonctionnement:**
1. Sélectionner plusieurs templates
2. Configurer les paramètres communs
3. Générer tous les fichiers
4. Télécharger en ZIP

**Dépendances:**
- `jszip` - Pour créer l'archive ZIP

**Estimation:** ~5h

---

### 2.3 Recherche de templates

**Description:** Filtrer et rechercher dans la liste des templates.

**Complexité:** 🟡 Moyen

**Fichiers à créer:**
- `components/template-search.tsx` - Barre de recherche avec filtres

**Fichiers à modifier:**
- `app/page.tsx` - Intégrer la recherche

**Critères de recherche:**
- Nom du fichier
- Type de véhicule (MOTO, TRICYCLE, etc.)
- Nombre de positions (plage)
- Poids (plage)

**Estimation:** ~3h

---

### 2.4 Dashboard statistiques

**Description:** Afficher des statistiques sur l'utilisation du générateur.

**Complexité:** 🟡 Moyen

**Fichiers à créer:**
- `app/dashboard/page.tsx` - Page dashboard
- `app/api/stats/route.ts` - API statistiques
- `components/stats-card.tsx` - Carte de statistique
- `components/stats-chart.tsx` - Graphiques

**Dépendances:**
- `recharts` ou `chart.js` - Pour les graphiques

**Métriques proposées:**
- Total VINs générés (aujourd'hui, semaine, mois)
- Templates les plus utilisés
- Distribution par type de véhicule
- Évolution dans le temps

**Stockage:**
- Upstash Redis pour les compteurs
- Ou Vercel Analytics

**Estimation:** ~8h

---

### 2.5 Mode hors-ligne (PWA)

**Description:** Transformer l'application en Progressive Web App.

**Complexité:** 🟡 Moyen

**Fichiers à créer:**
- `public/manifest.json` - Manifest PWA
- `public/sw.js` - Service Worker
- `app/offline/page.tsx` - Page hors-ligne

**Fichiers à modifier:**
- `app/layout.tsx` - Ajouter les meta tags PWA

**Fonctionnalités hors-ligne:**
- Consultation de l'historique local
- Validation de VIN (calcul local)
- Templates mis en cache

**Limitations:**
- Génération impossible sans connexion (séquences sur Redis)

**Estimation:** ~6h

---

## 🔴 Fonctionnalités complexes

### 3.1 Authentification

**Description:** Ajouter un système de connexion pour protéger l'accès.

**Complexité:** 🔴 Complexe

**Options:**
- **NextAuth.js** - Solution complète avec providers
- **Clerk** - Service d'authentification managé
- **Auth0** - Enterprise-grade

**Fichiers à créer:**
- `app/api/auth/[...nextauth]/route.ts` - API NextAuth
- `app/login/page.tsx` - Page de connexion
- `middleware.ts` - Protection des routes
- `lib/auth.ts` - Configuration auth

**Providers suggérés:**
- Google
- GitHub
- Email/Password

**Estimation:** ~10h

---

### 3.2 API publique avec clés

**Description:** Exposer une API REST documentée avec authentification par clé.

**Complexité:** 🔴 Complexe

**Fichiers à créer:**
- `app/api/v1/generate/route.ts` - Endpoint public
- `app/api/v1/templates/route.ts` - Liste templates
- `app/api/v1/validate/route.ts` - Validation VIN
- `app/developer/page.tsx` - Page développeur (clés API)
- `lib/api-keys.ts` - Gestion des clés

**Dépendances:**
- Base de données pour stocker les clés
- Rate limiting (Upstash Ratelimit)

**Documentation:**
- Swagger/OpenAPI
- Page de documentation interactive

**Estimation:** ~15h

---

### 3.3 Gestion des séquences

**Description:** Interface pour visualiser et gérer les compteurs de séquence.

**Complexité:** 🔴 Complexe

**Fichiers à créer:**
- `app/admin/sequences/page.tsx` - Page de gestion
- `app/api/admin/sequences/route.ts` - API CRUD séquences
- `components/sequence-manager.tsx` - Interface de gestion

**Fonctionnalités:**
- Voir tous les compteurs (par WMI/année)
- Réinitialiser un compteur
- Exporter l'état actuel
- Historique des modifications

**Sécurité:**
- Accès admin uniquement
- Logs des modifications

**Estimation:** ~8h

---

### 3.4 Multi-tenant

**Description:** Permettre à plusieurs organisations d'utiliser l'application avec isolation des données.

**Complexité:** 🔴 Très complexe

**Architecture:**
```
Organization A
├── Templates A
├── Séquences A
└── Utilisateurs A

Organization B
├── Templates B
├── Séquences B
└── Utilisateurs B
```

**Fichiers à créer:**
- `lib/tenant.ts` - Gestion du contexte tenant
- `app/api/organizations/route.ts` - CRUD organisations
- Middleware pour isolation des données

**Dépendances:**
- Base de données relationnelle (Vercel Postgres)
- Authentification (3.1)

**Estimation:** ~25h

---

### 3.5 Webhooks

**Description:** Notifier des systèmes externes après chaque génération.

**Complexité:** 🔴 Complexe

**Fichiers à créer:**
- `app/settings/webhooks/page.tsx` - Configuration webhooks
- `app/api/webhooks/route.ts` - CRUD webhooks
- `lib/webhook-service.ts` - Service d'envoi

**Payload webhook:**
```json
{
  "event": "generation.completed",
  "timestamp": "2025-01-22T12:00:00Z",
  "data": {
    "template": "70-POSITIONS-530-POIDS-MOTO.xml",
    "vinCount": 70,
    "vins": ["LZS..."],
    "config": { "wmi": "LZS", ... }
  }
}
```

**Fonctionnalités:**
- Retry automatique (3 tentatives)
- Logs des envois
- Test de webhook

**Estimation:** ~10h

---

## Priorités suggérées

### Phase 1 - Essentiels (Sprint 1)
1. ✅ Upload de templates (FAIT)
2. 🔲 Export CSV (1.4)
3. 🔲 Supprimer un template (1.1)

### Phase 2 - Amélioration UX (Sprint 2)
4. 🔲 Historique local (1.3)
5. 🔲 Recherche de templates (2.3)
6. 🔲 Prévisualisation template (1.2)

### Phase 3 - Outils avancés (Sprint 3)
7. 🔲 Validation de VIN (2.1)
8. 🔲 Génération par lot (2.2)
9. 🔲 Dashboard statistiques (2.4)

### Phase 4 - Enterprise (Sprint 4+)
10. 🔲 Authentification (3.1)
11. 🔲 API publique (3.2)
12. 🔲 Gestion des séquences (3.3)

---

## Notes

- Les estimations sont indicatives et peuvent varier
- Certaines fonctionnalités ont des dépendances (ex: 3.4 nécessite 3.1)
- Les fonctionnalités peuvent être adaptées selon les retours utilisateurs

---

*Dernière mise à jour: Janvier 2025*
