/**
 * Service de stockage des templates XML via Vercel Blob
 * ======================================================
 *
 * Ce service permet de :
 * - Uploader des templates XML vers Vercel Blob
 * - Lister les templates stockés dans Vercel Blob
 * - Lire le contenu d'un template depuis Vercel Blob
 * - Supprimer un template de Vercel Blob
 */

import { put, list, del } from "@vercel/blob";

/**
 * Préfixe pour tous les templates dans le blob storage
 */
const BLOB_PREFIX = "xml-templates/";

/**
 * Vérifie si Vercel Blob est configuré
 */
export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export interface BlobTemplate {
  filename: string;
  url: string;
  size: number;
  uploadedAt: Date;
}

export interface UploadResult {
  success: boolean;
  template?: BlobTemplate;
  error?: string;
}

/**
 * Upload un template vers Vercel Blob
 */
export async function uploadTemplateToBlob(
  filename: string,
  content: string
): Promise<UploadResult> {
  if (!isBlobConfigured()) {
    return {
      success: false,
      error: "Vercel Blob n'est pas configuré (BLOB_READ_WRITE_TOKEN manquant)",
    };
  }

  try {
    const blob = await put(`${BLOB_PREFIX}${filename}`, content, {
      access: "public",
      contentType: "application/xml",
      addRandomSuffix: false,
    });

    return {
      success: true,
      template: {
        filename,
        url: blob.url,
        size: content.length,
        uploadedAt: new Date(),
      },
    };
  } catch (error) {
    console.error("Erreur upload Vercel Blob:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

/**
 * Liste tous les templates dans Vercel Blob
 */
export async function listBlobTemplates(): Promise<BlobTemplate[]> {
  if (!isBlobConfigured()) {
    return [];
  }

  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX });

    return blobs.map((blob) => ({
      filename: blob.pathname.replace(BLOB_PREFIX, ""),
      url: blob.url,
      size: blob.size,
      uploadedAt: new Date(blob.uploadedAt),
    }));
  } catch (error) {
    console.error("Erreur listing Vercel Blob:", error);
    return [];
  }
}

/**
 * Récupère le contenu d'un template depuis Vercel Blob
 */
export async function getTemplateFromBlob(
  filename: string
): Promise<string | null> {
  if (!isBlobConfigured()) {
    return null;
  }

  try {
    const { blobs } = await list({ prefix: `${BLOB_PREFIX}${filename}` });
    const blob = blobs.find(
      (b) => b.pathname === `${BLOB_PREFIX}${filename}`
    );

    if (!blob) {
      return null;
    }

    const response = await fetch(blob.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error("Erreur lecture Vercel Blob:", error);
    return null;
  }
}

/**
 * Vérifie si un template existe dans Vercel Blob
 */
export async function templateExistsInBlob(filename: string): Promise<boolean> {
  if (!isBlobConfigured()) {
    return false;
  }

  try {
    const { blobs } = await list({ prefix: `${BLOB_PREFIX}${filename}` });
    return blobs.some((b) => b.pathname === `${BLOB_PREFIX}${filename}`);
  } catch {
    return false;
  }
}

/**
 * Supprime un template de Vercel Blob
 */
export async function deleteTemplateFromBlob(
  filename: string
): Promise<boolean> {
  if (!isBlobConfigured()) {
    return false;
  }

  try {
    const { blobs } = await list({ prefix: `${BLOB_PREFIX}${filename}` });
    const blob = blobs.find(
      (b) => b.pathname === `${BLOB_PREFIX}${filename}`
    );

    if (blob) {
      await del(blob.url);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erreur suppression Vercel Blob:", error);
    return false;
  }
}
