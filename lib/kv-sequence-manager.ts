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
 * Crée une instance Redis si les variables sont configurées
 */
function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

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

    // INCR est atomique dans Redis - parfait pour les compteurs
    const nextSeq = await this.redis.incr(key);

    // Vérifier limite VIN (6 digits max = 999999)
    if (nextSeq > 999999) {
      console.warn(
        `Séquence ${prefix} atteint limite (999999). Considérer changement de préfixe.`
      );
    }

    return nextSeq;
  }

  /**
   * Retourne la séquence actuelle pour ce préfixe
   */
  async getCurrentSequenceAsync(prefix: string): Promise<number> {
    if (!this.redis) {
      throw new Error("Redis non configuré.");
    }

    const key = `${SEQUENCE_PREFIX}${prefix}`;
    const value = await this.redis.get<number>(key);
    return value ?? 0;
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
 * Vérifie si Upstash Redis est configuré
 */
export function isKVConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return !!(url && token);
}
