/**
 * Script de migration des templates vers Vercel Blob
 * Usage: BLOB_READ_WRITE_TOKEN=xxx npx tsx scripts/migrate-to-blob.ts
 */

import { put, list } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

const BLOB_PREFIX = "xml-templates/";

async function migrate() {
  console.log("🚀 Début de la migration vers Vercel Blob...\n");

  // Vérifier le token
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("❌ BLOB_READ_WRITE_TOKEN non défini");
    process.exit(1);
  }

  // Lire les templates du filesystem
  const templateDir = path.join(process.cwd(), "xml-template");
  const files = await fs.readdir(templateDir);
  const xmlFiles = files.filter((f) => f.endsWith(".xml"));

  console.log(`📁 ${xmlFiles.length} templates trouvés\n`);

  // Vérifier les templates existants dans le blob
  const { blobs } = await list({ prefix: BLOB_PREFIX });
  const existingFiles = new Set(blobs.map((b) => b.pathname.replace(BLOB_PREFIX, "")));

  let migrated = 0;
  let skipped = 0;

  for (const filename of xmlFiles) {
    if (existingFiles.has(filename)) {
      console.log(`⏭️  ${filename} - déjà présent, ignoré`);
      skipped++;
      continue;
    }

    const filePath = path.join(templateDir, filename);
    const content = await fs.readFile(filePath, "utf-8");

    try {
      const blob = await put(`${BLOB_PREFIX}${filename}`, content, {
        access: "public",
        contentType: "application/xml",
        addRandomSuffix: false,
      });

      console.log(`✅ ${filename} → ${blob.url}`);
      migrated++;
    } catch (error) {
      console.error(`❌ ${filename} - Erreur:`, error);
    }
  }

  console.log(`\n📊 Résultat: ${migrated} migrés, ${skipped} ignorés`);
  console.log("\n✨ Migration terminée!");
}

migrate().catch(console.error);
