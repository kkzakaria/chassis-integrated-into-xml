import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { VINService } from "@/lib/vin-service";
import { VINGenerator } from "@/lib/vin-generator";

// Pool de WMI aléatoires (fabricants chinois)
const WMI_POOL = ["LZS", "LFV", "LBV", "LDC", "LGX", "LVS", "LHG"];

// Caractères autorisés pour VDS (sans I, O, Q)
const VDS_CHARS = "ABCDEFGHJKLMNPRSTUVWXY0123456789";

// Caractères autorisés pour code usine
const PLANT_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ123456789";

function generateRandomWMI(): string {
  return WMI_POOL[Math.floor(Math.random() * WMI_POOL.length)];
}

function generateRandomVDS(): string {
  let vds = "";
  for (let i = 0; i < 5; i++) {
    vds += VDS_CHARS[Math.floor(Math.random() * VDS_CHARS.length)];
  }
  return vds;
}

function generateRandomPlantCode(): string {
  return PLANT_CHARS[Math.floor(Math.random() * PLANT_CHARS.length)];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template, wmi, vds, year, plantCode } = body;

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template requis" },
        { status: 400 }
      );
    }

    // Année par défaut: année courante
    const targetYear = year || new Date().getFullYear();

    // Valeurs aléatoires si non fournies
    const finalWmi = wmi || generateRandomWMI();
    const finalVds = vds || generateRandomVDS();
    const finalPlantCode = plantCode || generateRandomPlantCode();

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
      wmi: finalWmi,
      vds: finalVds,
      year: targetYear,
      plantCode: finalPlantCode,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Échec de la génération des VINs" },
        { status: 500 }
      );
    }

    // Injecter les VINs dans le XML - Marks2_of_packages
    let vinIndex = 0;
    let updatedXml = xmlContent.replace(
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

    // Injecter les VINs dans Attached_documents (code 6122 ou 6022)
    vinIndex = 0;
    updatedXml = updatedXml.replace(
      /<Attached_documents>\s*<Attached_document_code>(6122|6022)<\/Attached_document_code>\s*<Attached_document_name>([^<]*)<\/Attached_document_name>\s*<Attached_document_from_rule>/g,
      (match, code, name) => {
        if (vinIndex < result.vins.length) {
          const vin = result.vins[vinIndex];
          vinIndex++;
          return `<Attached_documents>\n<Attached_document_code>${code}</Attached_document_code>\n<Attached_document_name>${name}</Attached_document_name>\n<Attached_document_reference>${vin}</Attached_document_reference>\n<Attached_document_from_rule>`;
        }
        return match;
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
        config: { wmi: finalWmi, vds: finalVds, year: targetYear, plantCode: finalPlantCode },
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
