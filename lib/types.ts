/**
 * Types pour le service de génération VIN
 */

export enum ChassisType {
  VIN_ISO3779 = "vin_iso3779",
  MANUFACTURER = "manufacturer",
}

export interface ValidationResult {
  isValid: boolean;
  chassisType: ChassisType | null;
  errors: string[];
  checksumValid: boolean | null;
}

export interface VINGenerationParams {
  wmi: string;
  vds: string;
  year: number;
  plant?: string;
  sequence?: number;
}

export interface VINBatchParams extends Omit<VINGenerationParams, "sequence"> {
  startSequence?: number;
  quantity: number;
}

export interface ManufacturerChassisParams {
  template: string;
  params: Record<string, string | number>;
}

export interface SequenceStatistics {
  totalPrefixes: number;
  totalVinsGenerated: number;
  maxSequence: number;
  averageSequence: number;
}

export interface VINGenerationRequest {
  quantity: number;
  wmi: string;
  vds?: string;
  year: number;
  plantCode?: string;
  outputFormat?: "json" | "csv" | "text";
}

export interface VINGenerationMetadata {
  quantity: number;
  wmi: string;
  vds: string;
  year: number;
  plantCode: string;
  prefix: string;
  startSequence: number;
  endSequence: number;
  generatedAt: string;
}

export interface VINGenerationResponse {
  success: boolean;
  vins: string[];
  metadata: VINGenerationMetadata;
}
