import { NextResponse } from "next/server";
import { checkKVConnection } from "@/lib/kv-sequence-manager";
import { checkBlobConnection } from "@/lib/blob-template-storage";
import { getSequenceManagerType } from "@/lib/sequence-manager-factory";

/**
 * Route de diagnostic
 * ===================
 *
 * Vérifie l'état des dépendances externes de l'application:
 * - Upstash Redis (séquences VIN, indispensable en production)
 * - Vercel Blob (stockage des templates XML)
 *
 * Aucune valeur secrète n'est exposée: uniquement la présence des variables
 * d'environnement et le message d'erreur renvoyé par le service.
 *
 * Usage: GET /api/health
 */

// Toujours exécuter à la demande, jamais depuis le cache
export const dynamic = "force-dynamic";

function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function GET() {
  const [redis, blob] = await Promise.all([
    checkKVConnection(),
    checkBlobConnection(),
  ]);

  const production = isProduction();
  const sequenceManager = getSequenceManagerType();

  const problems: string[] = [];

  if (!redis.configured) {
    problems.push(
      "Upstash Redis n'est pas configuré: les séquences utilisent le fichier local, " +
        "qui n'est pas inscriptible en production. Risque de numéros de châssis en doublon."
    );
  } else if (!redis.reachable) {
    problems.push(
      `Upstash Redis injoignable (${redis.error}). C'est la cause directe de l'erreur ` +
        `lors de la génération. La paire de variables utilisée est ${redis.source}.`
    );
  }

  // Les deux conventions définies en même temps: UPSTASH_REDIS_REST_* masque
  // KV_REST_API_*, ce qui peut désigner une base différente de celle attendue.
  if (redis.conflictingVariables) {
    problems.push(
      "UPSTASH_REDIS_REST_* et KV_REST_API_* sont toutes deux définies. " +
        "UPSTASH_REDIS_REST_* est prioritaire et masque l'autre paire. " +
        "Supprimez celle qui ne correspond pas à la base active."
    );
  }

  if (!blob.configured && production) {
    problems.push(
      "Vercel Blob n'est pas configuré en production: aucun template ne peut être lu."
    );
  } else if (blob.configured && !blob.reachable) {
    problems.push(`Vercel Blob injoignable (${blob.error}).`);
  } else if (blob.reachable && blob.templateCount === 0) {
    problems.push(
      "Vercel Blob ne contient aucun template. Lancez la migration via /api/templates/migrate " +
        "ou uploadez un template depuis l'interface."
    );
  }

  const healthy = problems.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      environment: production ? "production" : "development",
      sequenceManager,
      checks: {
        redis: {
          configured: redis.configured,
          reachable: redis.reachable,
          activeSource: redis.source,
          conflictingVariables: redis.conflictingVariables,
          latencyMs: redis.latencyMs,
          error: redis.error,
          envVars: {
            UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
            UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
            KV_REST_API_URL: !!process.env.KV_REST_API_URL,
            KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
          },
        },
        blob: {
          configured: blob.configured,
          reachable: blob.reachable,
          templateCount: blob.templateCount,
          latencyMs: blob.latencyMs,
          error: blob.error,
          envVars: {
            BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
          },
        },
      },
      problems,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
