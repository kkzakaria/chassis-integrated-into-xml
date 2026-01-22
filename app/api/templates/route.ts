import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { listBlobTemplates, isBlobConfigured } from "@/lib/blob-template-storage";

interface TemplateInfo {
  filename: string;
  positionCount: number;
  fileSizeKB: number;
  source: "filesystem" | "blob";
}

/**
 * Détermine si on est en mode production (Vercel)
 */
function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function GET() {
  try {
    const templates: TemplateInfo[] = [];

    // En production avec Blob configuré: utiliser uniquement Blob
    if (isProduction() && isBlobConfigured()) {
      const blobTemplates = await listBlobTemplates();

      for (const blob of blobTemplates) {
        const match = blob.filename.match(/^(\d+)-/);
        const positionCount = match ? parseInt(match[1], 10) : 0;

        templates.push({
          filename: blob.filename,
          positionCount,
          fileSizeKB: Math.round(blob.size / 1024),
          source: "blob",
        });
      }
    } else {
      // En développement: utiliser le filesystem
      const templateDir = path.join(process.cwd(), "xml-template");
      try {
        const files = await fs.readdir(templateDir);

        const fsTemplates = await Promise.all(
          files
            .filter((f) => f.endsWith(".xml"))
            .map(async (filename) => {
              const filePath = path.join(templateDir, filename);
              const stats = await fs.stat(filePath);

              const match = filename.match(/^(\d+)-/);
              const positionCount = match ? parseInt(match[1], 10) : 0;

              return {
                filename,
                positionCount,
                fileSizeKB: Math.round(stats.size / 1024),
                source: "filesystem" as const,
              };
            })
        );

        templates.push(...fsTemplates);
      } catch {
        // Le dossier n'existe peut-être pas
      }

      // En dev, ajouter aussi les templates Blob si configuré (pour tester)
      if (isBlobConfigured()) {
        const blobTemplates = await listBlobTemplates();
        const fsFilenames = new Set(templates.map((t) => t.filename));

        for (const blob of blobTemplates) {
          if (!fsFilenames.has(blob.filename)) {
            const match = blob.filename.match(/^(\d+)-/);
            const positionCount = match ? parseInt(match[1], 10) : 0;

            templates.push({
              filename: blob.filename,
              positionCount,
              fileSizeKB: Math.round(blob.size / 1024),
              source: "blob",
            });
          }
        }
      }
    }

    // Trier par nom de fichier
    templates.sort((a, b) => a.filename.localeCompare(b.filename));

    return NextResponse.json({
      success: true,
      templates,
      storage: isProduction() && isBlobConfigured() ? "blob" : "filesystem",
      blobConfigured: isBlobConfigured(),
    });
  } catch (error) {
    console.error("Erreur lors de la lecture des templates:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la lecture des templates" },
      { status: 500 }
    );
  }
}
