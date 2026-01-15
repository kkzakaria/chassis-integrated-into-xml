import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { VINService } from "@/lib/vin-service";
import { VINGenerator } from "@/lib/vin-generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template, wmi = "LZS", vds = "HCKZS", year, plantCode = "S" } = body;

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template requis" },
        { status: 400 }
      );
    }

    // Année par défaut: année courante
    const targetYear = year || new Date().getFullYear();

    // Vérifier que l'année est supportée
    if (!(targetYear in VINGenerator.YEAR_CODES)) {
      return NextResponse.json(
        { success: false, error: `Année ${targetYear} non supportée (2001-2030)` },
        { status: 400 }
      );
    }

    // Lire le template
    const templateDir = path.join(process.cwd(), "xml-template");
    const templatePath = path.join(templateDir, template);

    // Vérifier que le fichier existe
    try {
      await fs.access(templatePath);
    } catch {
      return NextResponse.json(
        { success: false, error: "Template non trouvé" },
        { status: 404 }
      );
    }

    const xmlContent = await fs.readFile(templatePath, "utf-8");

    // Extraire le nombre de positions depuis le nom du fichier
    const match = template.match(/^(\d+)-/);
    if (!match) {
      return NextResponse.json(
        { success: false, error: "Impossible d'extraire le nombre de positions du fichier" },
        { status: 400 }
      );
    }
    const positionCount = parseInt(match[1], 10);

    // Générer les VINs
    const vinService = new VINService();
    const result = vinService.generateVINs({
      quantity: positionCount,
      wmi,
      vds,
      year: targetYear,
      plantCode,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Échec de la génération des VINs" },
        { status: 500 }
      );
    }

    // Injecter les VINs dans le XML
    let vinIndex = 0;
    const updatedXml = xmlContent.replace(
      /<Marks2_of_packages\s*\/?>(?:<\/Marks2_of_packages>)?/g,
      () => {
        if (vinIndex < result.vins.length) {
          const vin = result.vins[vinIndex];
          vinIndex++;
          return `<Marks2_of_packages>${vin}</Marks2_of_packages>`;
        }
        return "<Marks2_of_packages/>";
      }
    );

    // Générer le timestamp pour le nom du fichier
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "_",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    const outputFilename = `${timestamp}_${template}`;

    return NextResponse.json({
      success: true,
      xml: updatedXml,
      filename: outputFilename,
      metadata: {
        originalTemplate: template,
        vinCount: positionCount,
        vinsGenerated: result.vins,
        timestamp,
        config: { wmi, vds, year: targetYear, plantCode },
      },
    });
  } catch (error) {
    console.error("Erreur génération:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}
