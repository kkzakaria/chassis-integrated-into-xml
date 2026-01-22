import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  validateTemplateFilename,
  validateTemplateContent,
  validateFileSize,
  sanitizeFilename,
} from "@/lib/template-validator";
import {
  isBlobConfigured,
  uploadTemplateToBlob,
  templateExistsInBlob,
} from "@/lib/blob-template-storage";

/**
 * Détermine si on est en mode production (Vercel)
 */
function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function POST(request: NextRequest) {
  try {
    // Parser le FormData
    const formData = await request.formData();
    const file = formData.get("template") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier la taille du fichier
    const sizeValidation = validateFileSize(file.size);
    if (!sizeValidation.valid) {
      return NextResponse.json(
        { success: false, error: sizeValidation.error },
        { status: 413 }
      );
    }

    // Sanitiser et valider le nom du fichier
    const sanitizedFilename = sanitizeFilename(file.name);
    const filenameValidation = validateTemplateFilename(sanitizedFilename);

    if (!filenameValidation.valid) {
      return NextResponse.json(
        { success: false, error: filenameValidation.error },
        { status: 400 }
      );
    }

    // Lire le contenu du fichier
    const content = await file.text();

    // Valider le contenu XML
    const contentValidation = validateTemplateContent(
      content,
      filenameValidation.positionCount!
    );

    if (!contentValidation.valid) {
      return NextResponse.json(
        { success: false, error: contentValidation.error },
        { status: 400 }
      );
    }

    // En production: utiliser uniquement Vercel Blob
    if (isProduction()) {
      if (!isBlobConfigured()) {
        return NextResponse.json(
          { success: false, error: "Vercel Blob non configuré en production" },
          { status: 500 }
        );
      }

      // Vérifier si le template existe déjà dans Blob
      const existsInBlob = await templateExistsInBlob(sanitizedFilename);
      if (existsInBlob) {
        return NextResponse.json(
          {
            success: false,
            error: `Un template avec le nom "${sanitizedFilename}" existe déjà`,
          },
          { status: 409 }
        );
      }

      // Upload vers Vercel Blob
      const uploadResult = await uploadTemplateToBlob(sanitizedFilename, content);

      if (!uploadResult.success) {
        return NextResponse.json(
          { success: false, error: uploadResult.error },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: "Template uploadé avec succès",
          storage: "blob",
          template: {
            filename: sanitizedFilename,
            positionCount: filenameValidation.positionCount,
            weight: filenameValidation.weight,
            type: filenameValidation.type,
            fileSizeKB: Math.round(file.size / 1024),
            url: uploadResult.template?.url,
          },
        },
        { status: 201 }
      );
    }

    // En développement: utiliser le filesystem
    const templateDir = path.join(process.cwd(), "xml-template");
    const targetPath = path.join(templateDir, sanitizedFilename);

    // Vérifier si le fichier existe déjà
    try {
      await fs.access(targetPath);
      return NextResponse.json(
        {
          success: false,
          error: `Un template avec le nom "${sanitizedFilename}" existe déjà`,
        },
        { status: 409 }
      );
    } catch {
      // Le fichier n'existe pas, on peut continuer
    }

    // Créer le répertoire si nécessaire
    await fs.mkdir(templateDir, { recursive: true });

    // Sauvegarder le fichier
    await fs.writeFile(targetPath, content, "utf-8");

    return NextResponse.json(
      {
        success: true,
        message: "Template uploadé avec succès",
        storage: "filesystem",
        template: {
          filename: sanitizedFilename,
          positionCount: filenameValidation.positionCount,
          weight: filenameValidation.weight,
          type: filenameValidation.type,
          fileSizeKB: Math.round(file.size / 1024),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur lors de l'upload du template:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erreur interne lors de l'upload du template",
      },
      { status: 500 }
    );
  }
}
