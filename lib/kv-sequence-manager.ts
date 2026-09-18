/**
 * Gestionnaire de séquences avec Upstash Redis
 * =============================================
 *
 * Utilise Upstash Redis pour garantir l'unicité des numéros de châssis
 * en production, même avec plusieurs instances serverless.
 *
 * Les opérations INCR de Redis sont atomiques, garantissant qu'aucun
 * doublon ne sera généré.
 *
 * @example
 * const manager = new KVSequenceManager();
 * const nextSeq = await manager.getNextSequenceAsync("LZSHCKZS2S");
 */

import { Redis } from "@upstash/redis";
import { SequenceStatistics } from "./types";
import { ISequenceManager } from "./vin-generator";

const SEQUENCE_PREFIX = "chassis_seq:";

/**
 * Paire de variables d'environnement décrivant une base Upstash
 *
 * Deux conventions coexistent selon la façon dont la base a été rattachée:
 * - UPSTASH_REDIS_REST_*  : variables saisies manuellement
 * - KV_REST_API_*         : variables provisionnées par l'intégration Vercel
 */
export type RedisCredentialSource = "UPSTASH_REDIS_REST_*" | "KV_REST_API_*";

interface RedisCredentials {
  url: string;
  token: string;
  source: RedisCredentialSource;
}

/**
 * Sélectionne une paire URL/token cohérente
 *
 * Les deux variables d'une même paire sont prises ensemble ou pas du tout:
 * combiner l'URL d'une convention avec le token de l'autre produirait un
 * client qui pointe vers une base avec les identifiants d'une autre.
 *
 * UPSTASH_REDIS_REST_* l'emporte quand les deux paires sont définies.
 */
function resolveRedisCredentials(): RedisCredentials | null {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    return {
      url: upstashUrl,
      token: upstashToken,
      source: "UPSTASH_REDIS_REST_*",
    };
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    return { url: kvUrl, token: kvToken, source: "KV_REST_API_*" };
  }

  return null;
}

/**
 * Retourne la paire de variables effectivement utilisée, ou null
 */
export function getActiveRedisSource(): RedisCredentialSource | null {
  return resolveRedisCredentials()?.source ?? null;
}

/**
 * Indique si les deux conventions sont définies en même temps
 *
 * Situation ambiguë: UPSTASH_REDIS_REST_* masque silencieusement
 * KV_REST_API_*, ce qui peut désigner une autre base que celle attendue.
 */
export function hasConflictingRedisVariables(): boolean {
  const hasUpstash = !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  return hasUpstash && hasKV;
}

/**
 * Crée une instance Redis si les variables sont configurées
 */
function createRedisClient(): Redis | null {
  const credentials = resolveRedisCredentials();

  if (!credentials) {
    return null;
  }

  return new Redis({ url: credentials.url, token: credentials.token });
}

/**
 * Transforme une erreur Redis brute en message exploitable
 *
 * Le client @upstash/redis relance l'erreur réseau de Node ("fetch failed")
 * après 5 tentatives lorsque l'endpoint ne répond pas. Ce message ne dit rien
 * à l'utilisateur: on le remplace par la cause probable et la marche à suivre.
 *
 * Les erreurs HTTP (UpstashError: mauvais token, quota dépassé) portent déjà
 * un message explicite de l'API et sont conservées telles quelles.
 */
function describeRedisError(error: unknown, operation: string): Error {
  const reason = error instanceof Error ? error.message : String(error);

  // Échec au niveau réseau: DNS, connexion refusée, TLS
  const isNetworkFailure =
    reason.includes("fetch failed") ||
    reason.includes("ENOTFOUND") ||
    reason.includes("ECONNREFUSED") ||
    reason.includes("ETIMEDOUT");

  if (isNetworkFailure) {
    const source = getActiveRedisSource() ?? "UPSTASH_REDIS_REST_*";

    // Nommer la paire réellement lue: pointer l'autre convention pousserait
    // à créer des variables qui masqueraient celles qui fonctionnent.
    let message =
      `Upstash Redis injoignable lors de ${operation} (${reason}). ` +
      "Causes fréquentes: base archivée pour inactivité, ou URL REST erronée. " +
      `La connexion utilise actuellement la paire ${source}: vérifiez que sa ` +
      "valeur correspond à l'URL REST de la base active sur console.upstash.com.";

    if (hasConflictingRedisVariables()) {
      message +=
        " Attention: UPSTASH_REDIS_REST_* et KV_REST_API_* sont toutes deux " +
        "définies. La première masque la seconde. Supprimez la paire inutile " +
        "pour lever l'ambiguïté.";
    }

    return new Error(message);
  }

  return new Error(`Upstash Redis a rejeté ${operation}: ${reason}`);
}

/**
 * Plage de séquences réservée de manière atomique
 */
export interface SequenceRange {
  start: number;
  end: number;
}

/**
 * Script Lua: relève un compteur à une valeur plancher sans jamais le baisser
 *
 * Redis n'a pas de "SET IF GREATER" natif. Passer par GET puis SET côté client
 * ouvrirait une fenêtre de concurrence; le script s'exécute atomiquement.
 */
const RAISE_FLOOR_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local floor = tonumber(ARGV[1])
if floor > current then
  redis.call('SET', KEYS[1], floor)
  return floor
end
return current
`;

/**
 * Gestionnaire de séquences utilisant Upstash Redis
 *
 * Avantages:
 * - Opérations atomiques (INCR)
 * - Partagé entre toutes les instances
 * - Persistant après redéploiement
 * - Haute disponibilité
 */
export class KVSequenceManager implements ISequenceManager {
  private redis: Redis | null;

  constructor() {
    this.redis = createRedisClient();
  }

  /**
   * Retourne la prochaine séquence unique pour ce préfixe
   * Non supporté en mode sync - utiliser getNextSequenceAsync
   */
  getNextSequence(_prefix: string): number {
    throw new Error(
      "KVSequenceManager ne supporte pas les opérations synchrones. Utilisez getNextSequenceAsync."
    );
  }

  /**
   * Retourne la séquence actuelle (non supporté en mode sync)
   */
  getCurrentSequence(_prefix: string): number {
    throw new Error(
      "KVSequenceManager ne supporte pas les opérations synchrones. Utilisez getCurrentSequenceAsync."
    );
  }

  /**
   * Retourne les statistiques (non supporté en mode sync)
   */
  getStatistics(): SequenceStatistics {
    throw new Error(
      "KVSequenceManager ne supporte pas les opérations synchrones. Utilisez getStatisticsAsync."
    );
  }

  /**
   * Retourne la prochaine séquence unique pour ce préfixe (async)
   * Utilise INCR de Redis qui est atomique
   */
  async getNextSequenceAsync(prefix: string): Promise<number> {
    if (!this.redis) {
      throw new Error("Redis non configuré. Vérifiez les variables UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN.");
    }

    const key = `${SEQUENCE_PREFIX}${prefix}`;

    let nextSeq: number;
    try {
      // INCR est atomique dans Redis - parfait pour les compteurs
      nextSeq = await this.redis.incr(key);
    } catch (error) {
      throw describeRedisError(error, `l'incrément de la séquence ${prefix}`);
    }

    // Vérifier limite VIN (6 digits max = 999999)
    if (nextSeq > 999999) {
      console.warn(
        `Séquence ${prefix} atteint limite (999999). Considérer changement de préfixe.`
      );
    }

    return nextSeq;
  }

  /**
   * Réserve une plage de séquences consécutives en une seule opération
   *
   * INCRBY est atomique: la plage [retour - count + 1, retour] appartient
   * exclusivement à cet appel, même si plusieurs instances serverless
   * réservent en même temps.
   *
   * Remplace N appels INCR successifs par un seul aller-retour réseau.
   */
  async reserveSequenceRangeAsync(
    prefix: string,
    count: number
  ): Promise<SequenceRange> {
    if (!this.redis) {
      throw new Error(
        "Redis non configuré. Vérifiez les variables UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN."
      );
    }

    if (count < 1) {
      throw new Error(`Le nombre de séquences à réserver doit être >= 1, reçu: ${count}`);
    }

    const key = `${SEQUENCE_PREFIX}${prefix}`;

    let end: number;
    try {
      end = await this.redis.incrby(key, count);
    } catch (error) {
      throw describeRedisError(
        error,
        `la réservation de ${count} séquences pour ${prefix}`
      );
    }

    const start = end - count + 1;

    // Vérifier limite VIN (6 digits max = 999999)
    if (end > 999999) {
      console.warn(
        `Séquence ${prefix} atteint limite (999999). Considérer changement de préfixe.`
      );
    }

    return { start, end };
  }

  /**
   * Relève le compteur d'un préfixe à une valeur plancher
   *
   * Ne baisse jamais un compteur: sert à réamorcer les séquences après
   * restauration d'une base, sans risquer de réémettre des numéros déjà
   * utilisés.
   *
   * @returns La valeur du compteur après l'opération
   */
  async raiseSequenceFloorAsync(prefix: string, floor: number): Promise<number> {
    if (!this.redis) {
      throw new Error("Redis non configuré.");
    }

    if (!Number.isInteger(floor) || floor < 0 || floor > 999999) {
      throw new Error(
        `Le plancher doit être un entier entre 0 et 999999, reçu: ${floor}`
      );
    }

    const key = `${SEQUENCE_PREFIX}${prefix}`;

    try {
      const result = await this.redis.eval(RAISE_FLOOR_SCRIPT, [key], [floor]);
      return Number(result);
    } catch (error) {
      throw describeRedisError(error, `le réamorçage de la séquence ${prefix}`);
    }
  }

  /**
   * Retourne la séquence actuelle pour ce préfixe
   */
  async getCurrentSequenceAsync(prefix: string): Promise<number> {
    if (!this.redis) {
      throw new Error("Redis non configuré.");
    }

    const key = `${SEQUENCE_PREFIX}${prefix}`;
    try {
      const value = await this.redis.get<number>(key);
      return value ?? 0;
    } catch (error) {
      throw describeRedisError(error, `la lecture de la séquence ${prefix}`);
    }
  }

  /**
   * Réinitialise la séquence pour un préfixe
   * ATTENTION: Peut créer des doublons si mal utilisé
   */
  async resetSequenceAsync(prefix: string, value: number = 0): Promise<void> {
    if (!this.redis) {
      throw new Error("Redis non configuré.");
    }

    const key = `${SEQUENCE_PREFIX}${prefix}`;
    await this.redis.set(key, value);
    console.warn(`Séquence ${prefix} réinitialisée à ${value}`);
  }

  /**
   * Retourne toutes les séquences actuelles
   */
  async getAllSequencesAsync(): Promise<Record<string, number>> {
    if (!this.redis) {
      throw new Error("Redis non configuré.");
    }

    try {
      const keys = await this.redis.keys(`${SEQUENCE_PREFIX}*`);
      const result: Record<string, number> = {};

      for (const key of keys) {
        const prefix = key.replace(SEQUENCE_PREFIX, "");
        const value = await this.redis.get<number>(key);
        if (value !== null) {
          result[prefix] = value;
        }
      }

      return result;
    } catch (error) {
      throw describeRedisError(error, "la lecture des séquences");
    }
  }

  /**
   * Retourne des statistiques sur les séquences
   */
  async getStatisticsAsync(): Promise<SequenceStatistics> {
    const sequences = await this.getAllSequencesAsync();
    const values = Object.values(sequences);

    if (values.length === 0) {
      return {
        totalPrefixes: 0,
        totalVinsGenerated: 0,
        maxSequence: 0,
        averageSequence: 0,
      };
    }

    const total = values.reduce((sum, val) => sum + val, 0);
    const maxSeq = Math.max(...values);
    const avgSeq = total / values.length;

    return {
      totalPrefixes: values.length,
      totalVinsGenerated: total,
      maxSequence: maxSeq,
      averageSequence: Math.round(avgSeq * 100) / 100,
    };
  }
}

/**
 * Instance singleton du gestionnaire KV
 */
let kvManagerInstance: KVSequenceManager | null = null;

/**
 * Retourne l'instance singleton du gestionnaire KV
 */
export function getKVSequenceManager(): KVSequenceManager {
  if (!kvManagerInstance) {
    kvManagerInstance = new KVSequenceManager();
  }
  return kvManagerInstance;
}

/**
 * Résultat d'un test de connexion à Upstash Redis
 */
export interface KVConnectionCheck {
  configured: boolean;
  reachable: boolean;
  /** Paire de variables effectivement lue par le client */
  source?: RedisCredentialSource;
  /** Vrai si les deux conventions sont définies, l'une masquant l'autre */
  conflictingVariables?: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Teste la connexion à Upstash Redis (diagnostic)
 *
 * Contrairement aux méthodes du manager, cette fonction ne lève jamais
 * d'exception: elle retourne l'erreur rencontrée pour affichage.
 */
export async function checkKVConnection(): Promise<KVConnectionCheck> {
  if (!isKVConfigured()) {
    return {
      configured: false,
      reachable: false,
      conflictingVariables: false,
      error:
        "Aucune paire complète de variables Redis. Définissez soit " +
        "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, soit " +
        "KV_REST_API_URL + KV_REST_API_TOKEN (URL et token de la même paire). " +
        "Les séquences retombent sur le fichier local, non persistant en production.",
    };
  }

  const redis = createRedisClient();
  if (!redis) {
    return { configured: false, reachable: false, error: "Client Redis non créé." };
  }

  const source = getActiveRedisSource() ?? undefined;
  const conflictingVariables = hasConflictingRedisVariables();
  const startedAt = Date.now();

  try {
    await redis.ping();
    return {
      configured: true,
      reachable: true,
      source,
      conflictingVariables,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      source,
      conflictingVariables,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Vérifie si Upstash Redis est configuré
 */
export function isKVConfigured(): boolean {
  return resolveRedisCredentials() !== null;
}
