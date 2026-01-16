/**
 * Service de traitement des templates XML ASYCUDA
 * ================================================
 *
 * Ce service permet de :
 * - Lire un template XML contenant des positions de véhicules
 * - Générer les VINs nécessaires selon le nombre de positions
 * - Mettre à jour le XML avec les VINs générés
 * - Retourner le XML avec un préfixe d'horodatage
 */

import { promises as fs } from "fs";
import path from "path";
import { VINService } from "./vin-service";
import { VINGenerator } from "./vin-generator";

export interface XMLTemplateConfig {
  wmi?: string;
  vds?: string;
  year?: number;
  plantCode?: string;
}

export interface XMLProcessingResult {
  success: boolean;
  outputPath: string;
  outputFilename: string;
  vinCount: number;
  vinsGenerated: string[];
  originalTemplate: string;
  timestamp: string;
  error?: string;
}

/**
 * Service de traitement des templates XML
 */
export class XMLTemplateService {
  private vinService: VINService;
  private templateDir: string;
  private outputDir: string;

  constructor(templateDir?: string, outputDir?: string) {
    this.vinService = new VINService();
    this.templateDir = templateDir ?? path.join(process.cwd(), "xml-template");
    this.outputDir = outputDir ?? path.join(process.cwd(), "xml-output");
  }

  /**
   * Extrait le nombre de positions depuis le nom du fichier
   * Format attendu: "70-POSITIONS-..." ou "140-POSITIONS-..."
   */
  extractPositionCount(filename: string): number {
    const match = filename.match(/^(\d+)-/);
    if (!match) {
      throw new Error(`Impossible d'extraire le nombre de positions du fichier: ${filename}`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Génère un timestamp pour le préfixe du fichier
   * Format: YYYYMMDD_HHmmss
   */
  generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  /**
   * Remplace les balises Marks2_of_packages vides par les VINs générés (avec préfixe "CH: ")
   * et ajoute Attached_document_reference dans les sections Attached_documents avec code 6122
   */
  injectVINsIntoXML(xmlContent: string, vins: string[]): string {
    let vinIndex = 0;

    // Remplacer les balises Marks2_of_packages vides ou avec contenu (avec préfixe "CH: ")
    // Gère les formats: <Marks2_of_packages/>, <Marks2_of_packages></Marks2_of_packages>,
    // et <Marks2_of_packages><null/></Marks2_of_packages> (avec sauts de ligne optionnels)
    let updatedXml = xmlContent.replace(
      /<Marks2_of_packages\s*\/?>(?:\s*(?:<null\s*\/>)?\s*<\/Marks2_of_packages>)?/g,
      () => {
        if (vinIndex < vins.length) {
          const vin = vins[vinIndex];
          vinIndex++;
          return `<Marks2_of_packages>CH: ${vin}</Marks2_of_packages>`;
        }
        return "<Marks2_of_packages/>";
      }
    );

    // Réinitialiser l'index pour les Attached_documents
    vinIndex = 0;

    // Ajouter Attached_document_reference dans les sections Attached_documents avec code 6122 ou 6022
    // Pattern pour matcher la section complète Attached_documents avec code 6122 ou 6022
    updatedXml = updatedXml.replace(
      /<Attached_documents>\s*<Attached_document_code>(6122|6022)<\/Attached_document_code>\s*<Attached_document_name>([^<]*)<\/Attached_document_name>\s*<Attached_document_from_rule>/g,
      (match, code, name) => {
        if (vinIndex < vins.length) {
          const vin = vins[vinIndex];
          vinIndex++;
          return `<Attached_documents>\n<Attached_document_code>${code}</Attached_document_code>\n<Attached_document_name>${name}</Attached_document_name>\n<Attached_document_reference>${vin}</Attached_document_reference>\n<Attached_document_from_rule>`;
        }
        return match;
      }
    );

    return updatedXml;
  }

  /**
   * Liste tous les templates XML disponibles
   */
  async listTemplates(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.templateDir);
      return files.filter((f) => f.endsWith(".xml"));
    } catch (error) {
      throw new Error(`Impossible de lire le dossier des templates: ${error}`);
    }
  }

  /**
   * Traite un template XML et génère les VINs
   */
  async processTemplate(
    templateFilename: string,
    config: XMLTemplateConfig = {}
  ): Promise<XMLProcessingResult> {
    const timestamp = this.generateTimestamp();

    try {
      // Configuration par défaut
      const {
        wmi = "LZS",
        vds = "HCKZS",
        year = new Date().getFullYear(),
        plantCode = "S",
      } = config;

      // Vérifier que l'année est supportée
      if (!(year in VINGenerator.YEAR_CODES)) {
        throw new Error(`Année ${year} non supportée (2001-2030)`);
      }

      // Lire le template
      const templatePath = path.join(this.templateDir, templateFilename);
      const xmlContent = await fs.readFile(templatePath, "utf-8");

      // Extraire le nombre de positions
      const positionCount = this.extractPositionCount(templateFilename);

      // Générer les VINs
      const result = this.vinService.generateVINs({
        quantity: positionCount,
        wmi,
        vds,
        year,
        plantCode,
      });

      if (!result.success) {
        throw new Error("Échec de la génération des VINs");
      }

      // Injecter les VINs dans le XML
      const updatedXml = this.injectVINsIntoXML(xmlContent, result.vins);

      // Créer le dossier de sortie si nécessaire
      await fs.mkdir(this.outputDir, { recursive: true });

      // Générer le nom du fichier de sortie avec timestamp
      const outputFilename = `${timestamp}_${templateFilename}`;
      const outputPath = path.join(this.outputDir, outputFilename);

      // Écrire le fichier de sortie
      await fs.writeFile(outputPath, updatedXml, "utf-8");

      return {
        success: true,
        outputPath,
        outputFilename,
        vinCount: positionCount,
        vinsGenerated: result.vins,
        originalTemplate: templateFilename,
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        outputPath: "",
        outputFilename: "",
        vinCount: 0,
        vinsGenerated: [],
        originalTemplate: templateFilename,
        timestamp,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Traite un template et retourne le contenu XML sans sauvegarder
   */
  async processTemplateToString(
    templateFilename: string,
    config: XMLTemplateConfig = {}
  ): Promise<{ xml: string; vins: string[]; timestamp: string }> {
    const timestamp = this.generateTimestamp();

    const {
      wmi = "LZS",
      vds = "HCKZS",
      year = new Date().getFullYear(),
      plantCode = "S",
    } = config;

    // Lire le template
    const templatePath = path.join(this.templateDir, templateFilename);
    const xmlContent = await fs.readFile(templatePath, "utf-8");

    // Extraire le nombre de positions
    const positionCount = this.extractPositionCount(templateFilename);

    // Générer les VINs
    const result = this.vinService.generateVINs({
      quantity: positionCount,
      wmi,
      vds,
      year,
      plantCode,
    });

    // Injecter les VINs dans le XML
    const updatedXml = this.injectVINsIntoXML(xmlContent, result.vins);

    return {
      xml: updatedXml,
      vins: result.vins,
      timestamp,
    };
  }

  /**
   * Traite tous les templates du dossier
   */
  async processAllTemplates(
    config: XMLTemplateConfig = {}
  ): Promise<XMLProcessingResult[]> {
    const templates = await this.listTemplates();
    const results: XMLProcessingResult[] = [];

    for (const template of templates) {
      const result = await this.processTemplate(template, config);
      results.push(result);
    }

    return results;
  }

  /**
   * Obtient les informations sur un template sans le traiter
   */
  async getTemplateInfo(templateFilename: string): Promise<{
    filename: string;
    positionCount: number;
    fileSizeKB: number;
  }> {
    const templatePath = path.join(this.templateDir, templateFilename);
    const stats = await fs.stat(templatePath);
    const positionCount = this.extractPositionCount(templateFilename);

    return {
      filename: templateFilename,
      positionCount,
      fileSizeKB: Math.round(stats.size / 1024),
    };
  }

  /**
   * Obtient les informations sur tous les templates
   */
  async getAllTemplatesInfo(): Promise<
    Array<{
      filename: string;
      positionCount: number;
      fileSizeKB: number;
    }>
  > {
    const templates = await this.listTemplates();
    const infos = await Promise.all(
      templates.map((t) => this.getTemplateInfo(t))
    );
    return infos;
  }
}

/**
 * Instance singleton du service
 */
let xmlTemplateServiceInstance: XMLTemplateService | null = null;

/**
 * Retourne l'instance singleton du service XML Template
 */
export function getXMLTemplateService(
  templateDir?: string,
  outputDir?: string
): XMLTemplateService {
  if (!xmlTemplateServiceInstance) {
    xmlTemplateServiceInstance = new XMLTemplateService(templateDir, outputDir);
  }
  return xmlTemplateServiceInstance;
}
