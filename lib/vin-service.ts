/**
 * Service de generation VIN simplifie
 *
 * Fournit une API simple pour generer des VINs uniques
 * avec persistance automatique des sequences.
 */

import { ChassisFactory, VINGenerator, ChassisValidator } from "./vin-generator";
import { ChassisSequenceManager } from "./chassis-sequence-manager";
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
