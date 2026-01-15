import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const templateDir = path.join(process.cwd(), "xml-template");
    const files = await fs.readdir(templateDir);

    const templates = await Promise.all(
      files
        .filter((f) => f.endsWith(".xml"))
        .map(async (filename) => {
          const filePath = path.join(templateDir, filename);
          const stats = await fs.stat(filePath);

          // Extraire le nombre de positions depuis le nom du fichier
          const match = filename.match(/^(\d+)-/);
          const positionCount = match ? parseInt(match[1], 10) : 0;

          return {
            filename,
            positionCount,
            fileSizeKB: Math.round(stats.size / 1024),
          };
        })
    );

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Erreur lors de la lecture des templates" },
      { status: 500 }
    );
  }
}
