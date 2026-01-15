/**
 * Service de generation VIN simplifie
 *
 * Fournit une API simple pour generer des VINs uniques
 * avec persistance automatique des sequences.
 *
 * Supporte deux modes:
 * - Synchrone (fichier local) pour le développement
 * - Asynchrone (Vercel KV) pour la production
 */

import { ChassisFactory, VINGenerator, ChassisValidator } from "./vin-generator";
import { ChassisSequenceManager } from "./chassis-sequence-manager";
import {
  getSequenceManager,
  getSequenceManagerType,
  AsyncSequenceManager,
} from "./sequence-manager-factory";
import {
  VINGenerationRequest,
  VINGenerationResponse,
  VINGenerationMetadata,
  SequenceStatistics,
} from "./types";

/**
 * Service de generation VIN avec gestion automatique des sequences
 */
export class VINService {
  private factory: ChassisFactory;
  private sequenceManager: ChassisSequenceManager;

  constructor(sequenceStoragePath?: string) {
    this.sequenceManager = new ChassisSequenceManager(sequenceStoragePath);
    this.factory = new ChassisFactory(this.sequenceManager);
  }

  /**
   * Genere des VINs uniques selon les parametres fournis
   */
  generateVINs(request: VINGenerationRequest): VINGenerationResponse {
    const {
      quantity,
      wmi,
      vds = "HCKZS",
      year,
      plantCode = "S",
    } = request;

    // Valider parametres
    if (quantity < 1 || quantity > 10000) {
      throw new Error("La quantite doit etre entre 1 et 10000");
    }
    if (wmi.length !== 3) {
      throw new Error("Le WMI doit avoir exactement 3 caracteres");
    }
    if (vds.length !== 5) {
      throw new Error("Le VDS doit avoir exactement 5 caracteres");
    }
    if (!(year in VINGenerator.YEAR_CODES)) {
      throw new Error(`L'annee ${year} n'est pas supportee (2001-2030)`);
    }
    if (plantCode.length !== 1) {
      throw new Error("Le code usine doit avoir exactement 1 caractere");
    }

    // Generer les VINs
    const vins = this.factory.createUniqueVINBatch(wmi, vds, year, plantCode, quantity);

    // Construire les metadonnees
    const yearCode = VINGenerator.YEAR_CODES[year];
    const prefix = `${wmi}${vds}${yearCode}${plantCode}`;
    const currentSeq = this.sequenceManager.getCurrentSequence(prefix);

    const metadata: VINGenerationMetadata = {
      quantity,
      wmi,
      vds,
      year,
      plantCode,
      prefix,
      startSequence: currentSeq - quantity + 1,
      endSequence: currentSeq,
      generatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      vins,
      metadata,
    };
  }

  /**
   * Genere un seul VIN unique
   */
  generateSingleVIN(
    wmi: string,
    vds: string = "HCKZS",
    year: number = new Date().getFullYear(),
    plantCode: string = "S"
  ): string {
    return this.factory.createUniqueVIN(wmi, vds, year, plantCode);
  }

  /**
   * Valide un VIN
   */
  validateVIN(vin: string): { valid: boolean; errors: string[] } {
    const result = ChassisValidator.validateVIN(vin);
    return {
      valid: result.isValid,
      errors: result.errors,
    };
  }

  /**
   * Retourne les statistiques des sequences
   */
  getSequencesStatus(): SequenceStatistics {
    return this.sequenceManager.getStatistics();
  }

  /**
   * Retourne toutes les sequences
   */
  getAllSequences(): Record<string, number> {
    return this.sequenceManager.getAllSequences();
  }

  /**
   * Exporte les VINs au format CSV
   */
  exportToCSV(vins: string[]): string {
    const header = "index,vin";
    const rows = vins.map((vin, i) => `${i + 1},${vin}`);
    return [header, ...rows].join("\n");
  }

  /**
   * Exporte les VINs au format texte (un par ligne)
   */
  exportToText(vins: string[]): string {
    return vins.join("\n");
  }
}

/**
 * Service de génération VIN asynchrone
 * Utilise Vercel KV en production, fichier local en développement
 */
export class AsyncVINService {
  private sequenceManager: AsyncSequenceManager;

  constructor() {
    this.sequenceManager = getSequenceManager();
  }

  /**
   * Génère des VINs uniques de manière asynchrone
   * Compatible avec Vercel KV pour la production
   */
  async generateVINsAsync(request: VINGenerationRequest): Promise<VINGenerationResponse> {
    const {
      quantity,
      wmi,
      vds = "HCKZS",
      year,
      plantCode = "S",
    } = request;

    // Valider paramètres
    if (quantity < 1 || quantity > 10000) {
      throw new Error("La quantité doit être entre 1 et 10000");
    }
    if (wmi.length !== 3) {
      throw new Error("Le WMI doit avoir exactement 3 caractères");
    }
    if (vds.length !== 5) {
      throw new Error("Le VDS doit avoir exactement 5 caractères");
    }
    if (!(year in VINGenerator.YEAR_CODES)) {
      throw new Error(`L'année ${year} n'est pas supportée (2001-2030)`);
    }
    if (plantCode.length !== 1) {
      throw new Error("Le code usine doit avoir exactement 1 caractère");
    }

    // Construire le préfixe
    const yearCode = VINGenerator.YEAR_CODES[year];
    const prefix = `${wmi}${vds}${yearCode}${plantCode}`;

    // Générer les VINs avec séquences atomiques
    const vins: string[] = [];
    let startSequence = 0;
    let endSequence = 0;

    for (let i = 0; i < quantity; i++) {
      const sequence = await this.sequenceManager.getNextSequenceAsync(prefix);
      if (i === 0) startSequence = sequence;
      endSequence = sequence;

      // Construire le VIN
      const sequenceStr = sequence.toString().padStart(6, "0");
      const vinWithoutChecksum = `${wmi}${vds}X${yearCode}${plantCode}${sequenceStr}`;
      const checksum = ChassisValidator.calculateVINChecksum(vinWithoutChecksum);
      const vin = `${wmi}${vds}${checksum}${yearCode}${plantCode}${sequenceStr}`;
      vins.push(vin);
    }

    const metadata: VINGenerationMetadata = {
      quantity,
      wmi,
      vds,
      year,
      plantCode,
      prefix,
      startSequence,
      endSequence,
      generatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      vins,
      metadata,
    };
  }

  /**
   * Génère un seul VIN unique
   */
  async generateSingleVINAsync(
    wmi: string,
    vds: string = "HCKZS",
    year: number = new Date().getFullYear(),
    plantCode: string = "S"
  ): Promise<string> {
    const result = await this.generateVINsAsync({
      quantity: 1,
      wmi,
      vds,
      year,
      plantCode,
    });
    return result.vins[0];
  }

  /**
   * Retourne le type de gestionnaire utilisé
   */
  getManagerType(): "kv" | "file" {
    return getSequenceManagerType();
  }
}

/**
 * Instance singleton du service
 */
let vinServiceInstance: VINService | null = null;

/**
 * Retourne l'instance singleton du service VIN
 */
export function getVINService(sequenceStoragePath?: string): VINService {
  if (!vinServiceInstance) {
    vinServiceInstance = new VINService(sequenceStoragePath);
  }
  return vinServiceInstance;
}
