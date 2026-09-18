/**
 * Factory pour le gestionnaire de séquences
 * ==========================================
 *
 * Sélectionne automatiquement le bon gestionnaire:
 * - Upstash Redis en production (obligatoire)
 * - Fichier JSON local en développement
 */

import { ChassisSequenceManager, getGlobalManager } from "./chassis-sequence-manager";
import { getKVSequenceManager, isKVConfigured } from "./kv-sequence-manager";

export type SequenceManagerType = "kv" | "file";

/**
 * Plage de séquences réservée de manière atomique, bornes incluses
 */
export interface SequenceRange {
  start: number;
  end: number;
}

export interface AsyncSequenceManager {
  getNextSequenceAsync(prefix: string): Promise<number>;
  getCurrentSequenceAsync(prefix: string): Promise<number>;
  getAllSequencesAsync(): Promise<Record<string, number>>;
  reserveSequenceRangeAsync(prefix: string, count: number): Promise<SequenceRange>;
  raiseSequenceFloorAsync(prefix: string, floor: number): Promise<number>;
}

/**
 * Détermine si on est en mode production (Vercel)
 */
function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

/**
 * Wrapper pour le ChassisSequenceManager qui expose une interface async
 */
class FileSequenceManagerAsync implements AsyncSequenceManager {
  private manager: ChassisSequenceManager;

  constructor() {
    this.manager = getGlobalManager();
  }

  async getNextSequenceAsync(prefix: string): Promise<number> {
    return this.manager.getNextSequence(prefix);
  }

  async getCurrentSequenceAsync(prefix: string): Promise<number> {
    return this.manager.getCurrentSequence(prefix);
  }

  async getAllSequencesAsync(): Promise<Record<string, number>> {
    return this.manager.getAllSequencesAsync();
  }

  async reserveSequenceRangeAsync(
    prefix: string,
    count: number
  ): Promise<SequenceRange> {
    return this.manager.reserveSequenceRangeAsync(prefix, count);
  }

  async raiseSequenceFloorAsync(prefix: string, floor: number): Promise<number> {
    return this.manager.raiseSequenceFloorAsync(prefix, floor);
  }
}

/**
 * Retourne le gestionnaire de séquences approprié
 * - Upstash Redis si configuré
 * - Fichier local sinon, mais uniquement en développement
 *
 * En production, le repli sur le fichier local est interdit: le système de
 * fichiers y est en lecture seule et réinitialisé à chaque instance, ce qui
 * produirait des numéros de châssis en doublon sans lever la moindre erreur.
 * Mieux vaut échouer bruyamment que délivrer des VINs déjà émis.
 */
export function getSequenceManager(): AsyncSequenceManager {
  if (isKVConfigured()) {
    return getKVSequenceManager();
  }

  if (isProduction()) {
    throw new Error(
      "Upstash Redis n'est pas configuré en production. Définissez une paire " +
        "complète dans les variables d'environnement Vercel: soit " +
        "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, soit " +
        "KV_REST_API_URL + KV_REST_API_TOKEN (l'URL et le token doivent venir " +
        "de la même paire). Le repli sur le fichier local est refusé ici: il " +
        "produirait des numéros de châssis en doublon."
    );
  }

  console.log("Utilisation du fichier local pour les séquences (développement)");
  return new FileSequenceManagerAsync();
}

/**
 * Retourne le type de gestionnaire utilisé
 */
export function getSequenceManagerType(): SequenceManagerType {
  return isKVConfigured() ? "kv" : "file";
}
