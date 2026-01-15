/**
 * Factory pour le gestionnaire de séquences
 * ==========================================
 *
 * Sélectionne automatiquement le bon gestionnaire:
 * - Vercel KV en production (si configuré)
 * - Fichier JSON local en développement
 */

import { ChassisSequenceManager, getGlobalManager } from "./chassis-sequence-manager";
import { getKVSequenceManager, isKVConfigured } from "./kv-sequence-manager";

export type SequenceManagerType = "kv" | "file";

export interface AsyncSequenceManager {
  getNextSequenceAsync(prefix: string): Promise<number>;
  getCurrentSequenceAsync(prefix: string): Promise<number>;
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
}

/**
 * Retourne le gestionnaire de séquences approprié
 * - KV si configuré (production)
 * - Fichier local sinon (développement)
 */
export function getSequenceManager(): AsyncSequenceManager {
  if (isKVConfigured()) {
    console.log("Utilisation de Vercel KV pour les séquences");
    return getKVSequenceManager();
  }
  console.log("Utilisation du fichier local pour les séquences");
  return new FileSequenceManagerAsync();
}

/**
 * Retourne le type de gestionnaire utilisé
 */
export function getSequenceManagerType(): SequenceManagerType {
  return isKVConfigured() ? "kv" : "file";
}
