/**
 * Generateur de numeros de chassis universel pour vehicules
 * ==========================================================
 *
 * Ce module fournit des outils generiques pour generer et valider des numeros
 * de chassis/VIN conformes aux standards industriels (ISO 3779) et aux formats
 * fabricants personnalises.
 *
 * Architecture:
 *   - VINGenerator: Generation VIN 17 caracteres ISO 3779 avec checksum
 *   - ManufacturerChassisGenerator: Generation chassis fabricant configurable
 *   - ChassisFactory: Point d'entree simplifie pour tous les cas d'usage
 *   - ChassisValidator: Validation universelle de formats
 */

import {
  ChassisType,
  ValidationResult,
  VINGenerationParams,
  VINBatchParams,
  ManufacturerChassisParams,
  SequenceStatistics,
} from "./types";

/**
 * Validateur universel de numeros de chassis
 *
 * Supporte:
 * - Validation VIN ISO 3779 (17 caracteres, checksum)
 * - Validation chassis fabricant (longueur, format)
 * - Detection automatique du type
 */
export class ChassisValidator {
  // Caracteres interdits dans les VIN ISO 3779
  private static readonly VIN_FORBIDDEN = new Set(["I", "O", "Q", "i", "o", "q"]);

  // Poids pour chaque position du VIN (ISO 3779)
  private static readonly VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  // Table de transcodage caracteres → valeurs numeriques (ISO 3779)
  private static readonly VIN_CHAR_VALUES: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
    "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  };

  /**
   * Calcule le checksum d'un VIN ISO 3779 (position 9)
   *
   * Le checksum est calcule selon l'algorithme ISO 3779:
   * 1. Chaque caractere est converti en valeur numerique
   * 2. Multiplie par un poids selon sa position
   * 3. La somme est divisee par 11, le reste donne le checksum
   */
  static calculateVINChecksum(vin: string): string {
    if (vin.length !== 17) {
      throw new Error(`VIN doit avoir 17 caracteres, recu: ${vin.length}`);
    }

    let total = 0;
    const upperVin = vin.toUpperCase();

    for (let i = 0; i < upperVin.length; i++) {
      if (i === 8) continue; // Position du checksum, ignoree dans le calcul

      const char = upperVin[i];
      const value = this.VIN_CHAR_VALUES[char] ?? 0;
      total += value * this.VIN_WEIGHTS[i];
    }

    const checksum = total % 11;
    return checksum === 10 ? "X" : String(checksum);
  }

  /**
   * Valide un VIN ISO 3779
   */
  static validateVIN(vin: string, checkChecksum: boolean = true): ValidationResult {
    const errors: string[] = [];

    // Verifier longueur
    if (vin.length !== 17) {
      errors.push(`Longueur incorrecte: ${vin.length} (attendu: 17)`);
      return {
        isValid: false,
        chassisType: ChassisType.VIN_ISO3779,
        errors,
        checksumValid: null,
      };
    }

    // Verifier caracteres alphanumeriques uniquement
    if (!/^[A-Za-z0-9]+$/.test(vin)) {
      errors.push("Caracteres non-alphanumeriques detectes");
    }

    // Verifier caracteres interdits
    const forbiddenFound = [...vin].filter((c) => this.VIN_FORBIDDEN.has(c));
    if (forbiddenFound.length > 0) {
      errors.push(`Caracteres interdits (I/O/Q): ${forbiddenFound.join(", ")}`);
    }

    // Verifier checksum si demande
    let checksumValid: boolean | null = null;
    if (checkChecksum && errors.length === 0) {
      try {
        const calculated = this.calculateVINChecksum(vin);
        const actual = vin[8].toUpperCase();
        checksumValid = calculated === actual;

        if (!checksumValid) {
          errors.push(`Checksum invalide: attendu '${calculated}', recu '${actual}'`);
        }
      } catch (e) {
        errors.push(`Erreur calcul checksum: ${e}`);
        checksumValid = false;
      }
    }

    return {
      isValid: errors.length === 0,
      chassisType: ChassisType.VIN_ISO3779,
      errors,
      checksumValid,
    };
  }

  /**
   * Valide un chassis fabricant
   */
  static validateManufacturerChassis(
    chassis: string,
    minLength: number = 13,
    maxLength: number = 17,
    allowedChars?: string
  ): ValidationResult {
    const errors: string[] = [];

    // Verifier longueur
    if (chassis.length < minLength || chassis.length > maxLength) {
      errors.push(`Longueur ${chassis.length} hors limites (${minLength}-${maxLength})`);
    }

    // Verifier caracteres autorises
    if (allowedChars === undefined) {
      if (!/^[A-Za-z0-9]+$/.test(chassis)) {
        errors.push("Caracteres non-alphanumeriques detectes");
      }
    } else {
      const invalidChars = [...chassis].filter((c) => !allowedChars.includes(c));
      if (invalidChars.length > 0) {
        errors.push(`Caracteres non autorises: ${invalidChars.join(", ")}`);
      }
    }

    return {
      isValid: errors.length === 0,
      chassisType: ChassisType.MANUFACTURER,
      errors,
      checksumValid: null,
    };
  }

  /**
   * Valide un chassis avec detection automatique du type
   */
  static validate(chassis: string, autoDetect: boolean = true): ValidationResult {
    if (autoDetect) {
      // Detection: 17 caracteres = VIN, sinon = fabricant
      if (chassis.length === 17) {
        return this.validateVIN(chassis);
      } else {
        return this.validateManufacturerChassis(chassis);
      }
    } else {
      // Par defaut, essayer validation VIN
      return this.validateVIN(chassis);
    }
  }
}

/**
 * Generateur de VIN ISO 3779 universel
 *
 * Genere des VIN 17 caracteres conformes a la norme ISO 3779 avec calcul
 * automatique du checksum en position 9.
 *
 * Structure VIN:
 *   Positions 1-3:   WMI (World Manufacturer Identifier)
 *   Positions 4-8:   VDS (Vehicle Descriptor Section)
 *   Position 9:      Checksum
 *   Position 10:     Annee modele (encodee)
 *   Position 11:     Usine de production
 *   Positions 12-17: Numero de serie
 */
export class VINGenerator {
  // Encodage annee modele (position 10) selon ISO 3779
  // Note: I, O, Q, U, Z sont EXCLUS pour eviter confusion (ISO 3779)
  static readonly YEAR_CODES: Record<number, string> = {
    2001: "1", 2002: "2", 2003: "3", 2004: "4", 2005: "5",
    2006: "6", 2007: "7", 2008: "8", 2009: "9",
    2010: "A", 2011: "B", 2012: "C", 2013: "D", 2014: "E",
    2015: "F", 2016: "G", 2017: "H", 2018: "J", // I saute
    2019: "K", 2020: "L", 2021: "M", 2022: "N", 2023: "P", // O saute
    2024: "R", 2025: "S", 2026: "T", 2027: "V", // Q et U sautes
    2028: "W", 2029: "X", 2030: "Y", // Z non utilise
  };

  /**
   * Genere un VIN ISO 3779
   *
   * @param wmi World Manufacturer Identifier (3 caracteres)
   * @param vds Vehicle Descriptor Section (5 caracteres)
   * @param year Annee modele (2001-2030)
   * @param plant Code usine (1 caractere, defaut: "S")
   * @param sequence Numero de serie (1-999999)
   * @param validateOutput Si true, valide le VIN genere
   *
   * @example
   * VINGenerator.generate("LZS", "HCKZS", 2028, "S", 4073)
   * // 'LZSHCKZS2S8054073'
   */
  static generate(
    wmi: string,
    vds: string,
    year: number,
    plant: string = "S",
    sequence: number = 1,
    validateOutput: boolean = true
  ): string {
    // Validation parametres
    if (wmi.length !== 3) {
      throw new Error(`WMI doit avoir 3 caracteres, recu: ${wmi.length}`);
    }
    if (vds.length !== 5) {
      throw new Error(`VDS doit avoir 5 caracteres, recu: ${vds.length}`);
    }
    if (!(year in this.YEAR_CODES)) {
      throw new Error(`Annee ${year} non supportee (2001-2030)`);
    }
    if (plant.length !== 1) {
      throw new Error(`Code usine doit avoir 1 caractere, recu: ${plant.length}`);
    }
    if (sequence < 1 || sequence > 999999) {
      throw new Error(`Sequence doit etre entre 1 et 999999, recu: ${sequence}`);
    }

    // Construire VIN sans checksum (X temporaire en position 9)
    const yearCode = this.YEAR_CODES[year];
    const sequenceStr = String(sequence).padStart(6, "0");
    const vinTemp = `${wmi.toUpperCase()}${vds.toUpperCase()}X${yearCode.toUpperCase()}${plant.toUpperCase()}${sequenceStr}`;

    // Calculer et inserer checksum
    const checksum = ChassisValidator.calculateVINChecksum(vinTemp);
    const vin = `${wmi.toUpperCase()}${vds.toUpperCase()}${checksum}${yearCode.toUpperCase()}${plant.toUpperCase()}${sequenceStr}`;

    // Validation optionnelle
    if (validateOutput) {
      const result = ChassisValidator.validateVIN(vin);
      if (!result.isValid) {
        throw new Error(`VIN genere invalide: ${result.errors.join(", ")}`);
      }
    }

    return vin;
  }

  /**
   * Genere un lot de VIN consecutifs
   */
  static generateBatch(
    wmi: string,
    vds: string,
    year: number,
    plant: string = "S",
    startSequence: number = 1,
    quantity: number = 1
  ): string[] {
    const vins: string[] = [];
    for (let i = 0; i < quantity; i++) {
      vins.push(this.generate(wmi, vds, year, plant, startSequence + i));
    }
    return vins;
  }
}

/**
 * Generateur de chassis fabricant configurable
 *
 * Genere des numeros de chassis personnalises selon un template avec
 * variables dynamiques. Supporte formats de longueur variable (13-17 caracteres).
 */
export class ManufacturerChassisGenerator {
  /**
   * Genere un chassis fabricant selon template
   *
   * @param template Template de format avec variables
   * @param params Dictionnaire de valeurs pour les variables
   *
   * @example
   * ManufacturerChassisGenerator.generate(
   *   "{prefix}{year}{seq}",
   *   { prefix: "AP2KC1A6S", year: "25", seq: "008796" }
   * )
   * // 'AP2KC1A6S25008796'
   */
  static generate(template: string, params: Record<string, string | number>): string {
    let chassis = template;

    for (const [key, value] of Object.entries(params)) {
      const regex = new RegExp(`\\{${key}(?::\\d+)?\\}`, "g");
      chassis = chassis.replace(regex, String(value));
    }

    return chassis.toUpperCase();
  }

  /**
   * Genere un lot de chassis avec sequence incrementale
   */
  static generateBatch(
    template: string,
    baseParams: Record<string, string | number>,
    sequenceVar: string = "seq",
    startSequence: number = 1,
    quantity: number = 1,
    padLength: number = 6
  ): string[] {
    const chassisList: string[] = [];

    for (let i = 0; i < quantity; i++) {
      const params = { ...baseParams };
      params[sequenceVar] = String(startSequence + i).padStart(padLength, "0");
      const chassis = this.generate(template, params);
      chassisList.push(chassis);
    }

    return chassisList;
  }
}

/**
 * Interface pour le gestionnaire de sequences (injection de dependance)
 */
export interface ISequenceManager {
  getNextSequence(prefix: string): number;
  getCurrentSequence(prefix: string): number;
  getStatistics(): SequenceStatistics;
}

/**
 * Point d'entree simplifie pour generation et validation de chassis
 *
 * Fournit une API unifiee pour tous les cas d'usage:
 * - Generation VIN ISO 3779
 * - Generation chassis fabricant
 * - Generation aleatoire pour tests
 * - Validation universelle
 * - Detection et continuation de sequences
 * - Generation unique (garantie anti-duplication)
 */
export class ChassisFactory {
  private sequenceManager: ISequenceManager | null = null;

  constructor(sequenceManager?: ISequenceManager) {
    this.sequenceManager = sequenceManager ?? null;
  }

  /**
   * Cree un VIN ISO 3779
   */
  createVIN(params: VINGenerationParams): string {
    return VINGenerator.generate(
      params.wmi,
      params.vds,
      params.year,
      params.plant ?? "S",
      params.sequence ?? 1
    );
  }

  /**
   * Cree un lot de VIN consecutifs
   */
  createVINBatch(params: VINBatchParams): string[] {
    return VINGenerator.generateBatch(
      params.wmi,
      params.vds,
      params.year,
      params.plant ?? "S",
      params.startSequence ?? 1,
      params.quantity
    );
  }

  /**
   * Cree un chassis fabricant
   */
  createChassis(params: ManufacturerChassisParams): string {
    return ManufacturerChassisGenerator.generate(params.template, params.params);
  }

  /**
   * Valide un chassis (detection automatique du type)
   */
  validate(chassis: string): ValidationResult {
    return ChassisValidator.validate(chassis);
  }

  /**
   * Cree un VIN ISO 3779 avec sequence unique garantie
   *
   * Necessite que la factory ait ete initialisee avec un sequenceManager.
   */
  createUniqueVIN(wmi: string, vds: string, year: number, plant: string = "S"): string {
    if (!this.sequenceManager) {
      throw new Error("Generation unique necessite un sequenceManager lors de l'initialisation");
    }

    if (!(year in VINGenerator.YEAR_CODES)) {
      throw new Error(`Annee ${year} non supportee (2001-2030)`);
    }

    const yearCode = VINGenerator.YEAR_CODES[year];
    const prefix = `${wmi}${vds}${yearCode}${plant}`;

    // Obtenir sequence unique suivante
    const sequence = this.sequenceManager.getNextSequence(prefix);

    // Generer VIN avec cette sequence
    return this.createVIN({ wmi, vds, year, plant, sequence });
  }

  /**
   * Cree un lot de VIN avec sequences uniques garanties
   */
  createUniqueVINBatch(
    wmi: string,
    vds: string,
    year: number,
    plant: string = "S",
    quantity: number = 1
  ): string[] {
    if (!this.sequenceManager) {
      throw new Error("Generation unique necessite un sequenceManager lors de l'initialisation");
    }

    const vins: string[] = [];
    for (let i = 0; i < quantity; i++) {
      vins.push(this.createUniqueVIN(wmi, vds, year, plant));
    }
    return vins;
  }

  /**
   * Retourne les statistiques du gestionnaire de sequences
   */
  getSequenceStatistics(): SequenceStatistics {
    if (!this.sequenceManager) {
      throw new Error("Statistiques necessitent un sequenceManager lors de l'initialisation");
    }
    return this.sequenceManager.getStatistics();
  }

  /**
   * Detecte le pattern d'une sequence et la continue
   */
  continueSequence(existing: string[], quantity: number = 1): { generated: string[]; pattern: string } {
    if (existing.length < 2) {
      throw new Error("Minimum 2 chassis requis pour detection de pattern");
    }

    const last = existing[existing.length - 1];
    const prev = existing[existing.length - 2];

    if (last.length !== prev.length) {
      throw new Error("Longueurs incoherentes dans la sequence");
    }

    // Chercher la difference (suffix numerique)
    let i = 0;
    while (i < last.length && last[i] === prev[i]) {
      i++;
    }

    if (i === last.length) {
      throw new Error("Aucune difference detectee entre chassis");
    }

    const prefix = last.slice(0, i);
    const suffixLast = last.slice(i);
    const suffixPrev = prev.slice(i);

    // Verifier si suffixes sont numeriques
    if (!/^\d+$/.test(suffixLast) || !/^\d+$/.test(suffixPrev)) {
      throw new Error("Sequence non-numerique detectee");
    }

    // Calculer increment
    const numLast = parseInt(suffixLast, 10);
    const numPrev = parseInt(suffixPrev, 10);
    const increment = numLast - numPrev;

    if (increment <= 0) {
      throw new Error(`Increment invalide: ${increment}`);
    }

    // Generer suite
    const generated: string[] = [];
    let nextNum = numLast + increment;
    for (let j = 0; j < quantity; j++) {
      const chassis = prefix + String(nextNum).padStart(suffixLast.length, "0");
      generated.push(chassis);
      nextNum += increment;
    }

    const patternDesc = `Sequence numerique: ${prefix} + ${suffixLast.length} digits (incr=${increment})`;

    return { generated, pattern: patternDesc };
  }

  /**
   * Cree des chassis aleatoires pour tests
   */
  createRandom(
    hsCode: string,
    quantity: number = 1,
    chassisType: ChassisType = ChassisType.VIN_ISO3779
  ): string[] {
    const wmiPool = ["LZS", "LFV", "LBV", "LDC", "LGX"];
    const allowedChars = "ABCDEFGHJKLMNPRSTUVWXY0123456789"; // Sans I, O, Q

    const chassisList: string[] = [];

    for (let n = 0; n < quantity; n++) {
      if (chassisType === ChassisType.VIN_ISO3779) {
        const wmi = wmiPool[Math.floor(Math.random() * wmiPool.length)];
        let vds = "";
        for (let k = 0; k < 5; k++) {
          vds += allowedChars[Math.floor(Math.random() * allowedChars.length)];
        }
        const year = 2020 + Math.floor(Math.random() * 9);
        const sequence = 1 + Math.floor(Math.random() * 99999);
        const chassis = this.createVIN({ wmi, vds, year, plant: "S", sequence });
        chassisList.push(chassis);
      } else {
        let prefix = "";
        for (let k = 0; k < 9; k++) {
          prefix += allowedChars[Math.floor(Math.random() * allowedChars.length)];
        }
        const year = 20 + Math.floor(Math.random() * 11);
        const seq = 1 + Math.floor(Math.random() * 9999);
        const chassis = this.createChassis({
          template: "{prefix}{year}{seq}",
          params: {
            prefix,
            year: String(year).padStart(2, "0"),
            seq: String(seq).padStart(5, "0"),
          },
        });
        chassisList.push(chassis);
      }
    }

    return chassisList;
  }
}
