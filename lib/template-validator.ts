/**
 * Module de validation des templates XML
 * =======================================
 *
 * Ce module fournit des fonctions de validation pour :
 * - Le format du nom de fichier des templates
 * - La structure et le contenu XML des templates
 */

/**
 * Pattern regex pour valider le format du nom de fichier
 * Format attendu: {N}-POSITION(S)-{POIDS}-POIDS-{TYPE}.xml
 * Exemples valides:
 * - 70-POSITIONS-530-POIDS-MOTO.xml
 * - 140-POSITION-1039-POIDS-TRICYCLE.xml
 * - 250-POSITIONS-2375-POIDS-MOTO.xml
 */
export const TEMPLATE_FILENAME_PATTERN =
  /^(\d+)-POSITIONS?-(\d+)-POIDS-([\w-]+)\.xml$/i;

/**
 * Taille maximale du fichier en bytes (5 MB)
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Pattern regex pour compter les balises Marks2_of_packages
 * Gère les formats:
 * - <Marks2_of_packages/> (self-closing)
 * - <Marks2_of_packages></Marks2_of_packages> (vide)
 * - <Marks2_of_packages>contenu</Marks2_of_packages> (avec contenu)
 */
export const MARKS2_PATTERN =
  /<Marks2_of_packages\s*\/>|<Marks2_of_packages>[\s\S]*?<\/Marks2_of_packages>/g;

export interface FilenameValidationResult {
  valid: boolean;
  positionCount?: number;
  weight?: number;
  type?: string;
  error?: string;
}

export interface ContentValidationResult {
  valid: boolean;
  marks2Count?: number;
  error?: string;
}

/**
 * Valide le format du nom de fichier d'un template
 */
export function validateTemplateFilename(
  filename: string
): FilenameValidationResult {
  // Vérifier l'extension
  if (!filename.toLowerCase().endsWith(".xml")) {
    return {
      valid: false,
      error: "Le fichier doit avoir l'extension .xml",
    };
  }

  // Vérifier le format du nom
  const match = filename.match(TEMPLATE_FILENAME_PATTERN);
  if (!match) {
    return {
      valid: false,
      error:
        "Format de nom invalide. Format attendu: {N}-POSITIONS-{POIDS}-POIDS-{TYPE}.xml",
    };
  }

  const positionCount = parseInt(match[1], 10);
  const weight = parseInt(match[2], 10);
  const type = match[3];

  // Vérifier que le nombre de positions est positif
  if (positionCount <= 0) {
    return {
      valid: false,
      error: "Le nombre de positions doit être supérieur à 0",
    };
  }

  return {
    valid: true,
    positionCount,
    weight,
    type,
  };
}

/**
 * Valide le contenu XML d'un template
 */
export function validateTemplateContent(
  content: string,
  expectedPositions: number
): ContentValidationResult {
  // Vérifier que le contenu est du XML
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith("<?xml") && !trimmedContent.startsWith("<")) {
    return {
      valid: false,
      error: "Le fichier n'est pas un document XML valide",
    };
  }

  // Compter les balises Marks2_of_packages
  const matches = content.match(MARKS2_PATTERN);
  const marks2Count = matches ? matches.length : 0;

  if (marks2Count === 0) {
    return {
      valid: false,
      marks2Count: 0,
      error: "Le template ne contient aucune balise <Marks2_of_packages>",
    };
  }

  // Vérifier que le nombre correspond au nom du fichier
  if (marks2Count !== expectedPositions) {
    return {
      valid: false,
      marks2Count,
      error: `Le nombre de balises <Marks2_of_packages> (${marks2Count}) ne correspond pas au nombre dans le nom du fichier (${expectedPositions})`,
    };
  }

  return {
    valid: true,
    marks2Count,
  };
}

/**
 * Valide la taille du fichier
 */
export function validateFileSize(size: number): {
  valid: boolean;
  error?: string;
} {
  if (size > MAX_FILE_SIZE) {
    const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
    const actualSizeMB = (size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Le fichier est trop volumineux (${actualSizeMB} MB). Taille maximale: ${maxSizeMB} MB`,
    };
  }
  return { valid: true };
}

/**
 * Sanitize le nom de fichier pour éviter les attaques de traversal
 */
export function sanitizeFilename(filename: string): string {
  // Extraire uniquement le nom de base (sans chemin)
  const basename = filename.split(/[/\\]/).pop() || filename;
  // Supprimer les caractères dangereux
  return basename.replace(/[^\w\-._]/g, "");
}
