/**
 * Gestionnaire de sequences uniques pour numeros de chassis
 * ==========================================================
 *
 * Garantit qu'aucun numero de chassis ne soit genere deux fois en maintenant
 * des compteurs de sequence persistants pour chaque combinaison de prefixe.
 *
 * @example
 * const manager = new ChassisSequenceManager();
 * const nextSeq = manager.getNextSequence("LZSHCKZS2S");
 */

import { promises as fs } from "fs";
import * as fsSync from "fs";
import path from "path";
import { SequenceStatistics } from "./types";
import { ISequenceManager } from "./vin-generator";

/**
 * Gestionnaire de sequences uniques pour numeros de chassis
 *
 * Maintient un compteur de sequence pour chaque prefixe de chassis
 * (WMI+VDS+Year+Plant = 10 premiers caracteres du VIN).
 *
 * Les sequences sont persistees dans un fichier JSON pour garantir
 * l'unicite meme apres redemarrage de l'application.
 */
export class ChassisSequenceManager implements ISequenceManager {
  private storagePath: string;
  private sequences: Map<string, number> = new Map();
  private isLoaded: boolean = false;

  constructor(storagePath?: string) {
    this.storagePath =
      storagePath ?? path.join(process.cwd(), "data", "chassis_sequences.json");
  }

  /**
   * Charge les sequences depuis le fichier JSON
   */
  private async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.storagePath, "utf-8");
      const parsed = JSON.parse(data) as Record<string, number>;
      this.sequences = new Map(Object.entries(parsed));
      console.log(`Charge ${this.sequences.size} sequences depuis ${this.storagePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log("Aucun fichier de sequences existant. Demarrage avec sequences vides.");
        this.sequences = new Map();
      } else {
        console.warn(`Erreur chargement sequences: ${error}. Demarrage avec sequences vides.`);
        this.sequences = new Map();
      }
    }

    this.isLoaded = true;
  }

  /**
   * Charge les sequences de maniere synchrone (pour utilisation simple)
   */
  private loadSync(): void {
    if (this.isLoaded) return;

    try {
      const dir = path.dirname(this.storagePath);

      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }

      if (fsSync.existsSync(this.storagePath)) {
        const data = fsSync.readFileSync(this.storagePath, "utf-8");
        const parsed = JSON.parse(data) as Record<string, number>;
        this.sequences = new Map(Object.entries(parsed));
      }
    } catch {
      this.sequences = new Map();
    }

    this.isLoaded = true;
  }

  /**
   * Sauvegarde les sequences dans le fichier JSON
   */
  private async save(): Promise<void> {
    try {
      const dir = path.dirname(this.storagePath);
      await fs.mkdir(dir, { recursive: true });

      const data = Object.fromEntries(this.sequences);
      await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Erreur sauvegarde sequences: ${error}`);
    }
  }

  /**
   * Sauvegarde les sequences de maniere synchrone
   */
  private saveSync(): void {
    try {
      const dir = path.dirname(this.storagePath);

      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }

      const data = Object.fromEntries(this.sequences);
      fsSync.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Erreur sauvegarde sequences: ${error}`);
    }
  }

  /**
   * Retourne la prochaine sequence unique pour ce prefixe
   *
   * @param prefix Prefixe du chassis (10 premiers chars du VIN sans checksum)
   *               Format: WMI(3) + VDS(5) + Year(1) + Plant(1)
   *               Exemple: "LZSHCKZS2S"
   *
   * @returns Prochaine sequence unique (entier 1-999999)
   */
  getNextSequence(prefix: string): number {
    this.loadSync();

    // Recuperer sequence actuelle (0 si nouveau prefixe)
    const current = this.sequences.get(prefix) ?? 0;

    // Incrementer
    const nextSeq = current + 1;

    // Verifier limite VIN (6 digits max = 999999)
    if (nextSeq > 999999) {
      console.warn(
        `Sequence ${prefix} atteint limite (999999). Considerer changement de prefixe.`
      );
    }

    // Sauvegarder nouvelle sequence
    this.sequences.set(prefix, nextSeq);
    this.saveSync();

    return nextSeq;
  }

  /**
   * Version asynchrone de getNextSequence
   */
  async getNextSequenceAsync(prefix: string): Promise<number> {
    await this.load();

    const current = this.sequences.get(prefix) ?? 0;
    const nextSeq = current + 1;

    if (nextSeq > 999999) {
      console.warn(`Sequence ${prefix} atteint limite (999999).`);
    }

    this.sequences.set(prefix, nextSeq);
    await this.save();

    return nextSeq;
  }

  /**
   * Retourne la derniere sequence utilisee pour ce prefixe
   */
  getCurrentSequence(prefix: string): number {
    this.loadSync();
    return this.sequences.get(prefix) ?? 0;
  }

  /**
   * Version asynchrone de getCurrentSequence
   */
  async getCurrentSequenceAsync(prefix: string): Promise<number> {
    await this.load();
    return this.sequences.get(prefix) ?? 0;
  }

  /**
   * Reinitialise la sequence pour un prefixe
   *
   * ATTENTION: Utiliser avec precaution! Peut creer des doublons si mal utilise.
   */
  resetSequence(prefix: string, value: number = 0): void {
    this.loadSync();
    this.sequences.set(prefix, value);
    this.saveSync();
    console.warn(`Sequence ${prefix} reinitialisee a ${value}`);
  }

  /**
   * Version asynchrone de resetSequence
   */
  async resetSequenceAsync(prefix: string, value: number = 0): Promise<void> {
    await this.load();
    this.sequences.set(prefix, value);
    await this.save();
    console.warn(`Sequence ${prefix} reinitialisee a ${value}`);
  }

  /**
   * Retourne toutes les sequences actuelles
   */
  getAllSequences(): Record<string, number> {
    this.loadSync();
    return Object.fromEntries(this.sequences);
  }

  /**
   * Version asynchrone de getAllSequences
   */
  async getAllSequencesAsync(): Promise<Record<string, number>> {
    await this.load();
    return Object.fromEntries(this.sequences);
  }

  /**
   * Efface toutes les sequences
   *
   * ATTENTION: Utiliser avec EXTREME precaution! Efface toutes les donnees.
   */
  clearAllSequences(): void {
    this.sequences = new Map();
    this.saveSync();
    console.warn("Toutes les sequences ont ete effacees");
  }

  /**
   * Version asynchrone de clearAllSequences
   */
  async clearAllSequencesAsync(): Promise<void> {
    this.sequences = new Map();
    await this.save();
    console.warn("Toutes les sequences ont ete effacees");
  }

  /**
   * Retourne des statistiques sur les sequences
   */
  getStatistics(): SequenceStatistics {
    this.loadSync();

    if (this.sequences.size === 0) {
      return {
        totalPrefixes: 0,
        totalVinsGenerated: 0,
        maxSequence: 0,
        averageSequence: 0,
      };
    }

    const values = Array.from(this.sequences.values());
    const total = values.reduce((sum, val) => sum + val, 0);
    const maxSeq = Math.max(...values);
    const avgSeq = total / values.length;

    return {
      totalPrefixes: this.sequences.size,
      totalVinsGenerated: total,
      maxSequence: maxSeq,
      averageSequence: Math.round(avgSeq * 100) / 100,
    };
  }

  /**
   * Version asynchrone de getStatistics
   */
  async getStatisticsAsync(): Promise<SequenceStatistics> {
    await this.load();

    if (this.sequences.size === 0) {
      return {
        totalPrefixes: 0,
        totalVinsGenerated: 0,
        maxSequence: 0,
        averageSequence: 0,
      };
    }

    const values = Array.from(this.sequences.values());
    const total = values.reduce((sum, val) => sum + val, 0);
    const maxSeq = Math.max(...values);
    const avgSeq = total / values.length;

    return {
      totalPrefixes: this.sequences.size,
      totalVinsGenerated: total,
      maxSequence: maxSeq,
      averageSequence: Math.round(avgSeq * 100) / 100,
    };
  }
}

/**
 * Instance singleton globale (optionnel)
 */
let globalManager: ChassisSequenceManager | null = null;

/**
 * Retourne l'instance singleton du gestionnaire de sequences
 */
export function getGlobalManager(): ChassisSequenceManager {
  if (!globalManager) {
    globalManager = new ChassisSequenceManager();
  }
  return globalManager;
}
