/**
 * Service de generation de numeros VIN
 *
 * Export principal pour le service de generation de chassis/VIN
 *
 * @example
 * import { ChassisFactory, ChassisSequenceManager, VINGenerator } from '@/lib';
 *
 * // Generation simple
 * const vin = VINGenerator.generate("LZS", "HCKZS", 2028, "S", 1);
 *
 * // Generation avec sequences uniques
 * const manager = new ChassisSequenceManager();
 * const factory = new ChassisFactory(manager);
 * const uniqueVin = factory.createUniqueVIN("LZS", "HCKZS", 2028, "S");
 */

// Types
export * from "./types";

// Classes principales
export {
  ChassisValidator,
  VINGenerator,
  ManufacturerChassisGenerator,
  ChassisFactory,
  type ISequenceManager,
} from "./vin-generator";

// Gestionnaire de sequences
export {
  ChassisSequenceManager,
  getGlobalManager,
} from "./chassis-sequence-manager";

// Service VIN simplifie
export { VINService, getVINService } from "./vin-service";

// Service de traitement XML template
export {
  XMLTemplateService,
  getXMLTemplateService,
  type XMLTemplateConfig,
  type XMLProcessingResult,
} from "./xml-template-service";
