import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  isBlobConfigured,
  uploadTemplateToBlob,
  templateExistsInBlob,
} from "@/lib/blob-template-storage";

/**
 * API de migration des templates du filesystem vers Vercel Blob
 *
 * POST /api/templates/migrate
 * Header: Authorization: Bearer <MIGRATION_SECRET>
 *
 * Cette API est protégée par un secret pour éviter les migrations non autorisées.
 * Définir MIGRATION_SECRET dans les variables d'environnement Vercel.
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'autorisation
    const authHeader = request.headers.get("Authorization");
    const migrationSecret = process.env.MIGRATION_SECRET;

    if (!migrationSecret) {
      return NextResponse.json(
        { success: false, error: "MIGRATION_SECRET non configuré" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${migrationSecret}`) {
      return NextResponse.json(
        { success: false, error: "Non autorisé" },
        { status: 401 }
      );
    }

    // Vérifier que Blob est configuré
    if (!isBlobConfigured()) {
      return NextResponse.json(
        { success: false, error: "Vercel Blob non configuré (BLOB_READ_WRITE_TOKEN manquant)" },
        { status: 500 }
      );
    }

    // Lire les templates du filesystem
    const templateDir = path.join(process.cwd(), "xml-template");
    let files: string[] = [];

    try {
      files = await fs.readdir(templateDir);
      files = files.filter((f) => f.endsWith(".xml"));
    } catch {
      return NextResponse.json(
        { success: false, error: "Dossier xml-template introuvable" },
        { status: 404 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucun template à migrer",
        migrated: [],
        skipped: [],
        errors: [],
      });
    }

    const results = {
      migrated: [] as string[],
      skipped: [] as string[],
      errors: [] as { filename: string; error: string }[],
    };

    // Migrer chaque template
    for (const filename of files) {
      try {
        // Vérifier si déjà présent dans Blob
        const existsInBlob = await templateExistsInBlob(filename);
        if (existsInBlob) {
          results.skipped.push(filename);
          continue;
        }

        // Lire le contenu
        const filePath = path.join(templateDir, filename);
        const content = await fs.readFile(filePath, "utf-8");

        // Uploader vers Blob
        const uploadResult = await uploadTemplateToBlob(filename, content);

        if (uploadResult.success) {
          results.migrated.push(filename);
        } else {
          results.errors.push({
            filename,
            error: uploadResult.error || "Erreur inconnue",
          });
        }
      } catch (error) {
        results.errors.push({
          filename,
          error: error instanceof Error ? error.message : "Erreur inconnue",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration terminée: ${results.migrated.length} migrés, ${results.skipped.length} ignorés, ${results.errors.length} erreurs`,
      ...results,
    });
  } catch (error) {
    console.error("Erreur migration:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la migration" },
      { status: 500 }
    );
  }
}
