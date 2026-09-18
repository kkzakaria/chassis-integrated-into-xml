import { NextRequest, NextResponse } from "next/server";
import {
  getSequenceManager,
  getSequenceManagerType,
} from "@/lib/sequence-manager-factory";

/**
 * API d'administration des séquences de châssis
 * ==============================================
 *
 * GET  /api/sequences  - Liste les compteurs actuels de chaque préfixe
 * POST /api/sequences  - Relève des compteurs à une valeur plancher
 *
 * Header requis: Authorization: Bearer <ADMIN_SECRET>
 * (à défaut, MIGRATION_SECRET est accepté pour éviter une variable de plus)
 *
 * Usage prévu: après restauration d'une base Upstash archivée, vérifier que
 * les compteurs sont bien revenus, et les réamorcer si la base est repartie
 * à vide — sans quoi l'application réémettrait des numéros déjà utilisés sur
 * des documents douaniers.
 *
 * Un compteur ne peut qu'être relevé, jamais abaissé: baisser un compteur
 * garantirait des doublons.
 */

export const dynamic = "force-dynamic";

/**
 * Valide l'en-tête Authorization
 *
 * @returns null si autorisé, sinon la réponse d'erreur à renvoyer
 */
function checkAuthorization(request: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_SECRET || process.env.MIGRATION_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Aucun secret configuré. Définissez ADMIN_SECRET (ou MIGRATION_SECRET) " +
          "dans les variables d'environnement Vercel.",
      },
      { status: 500 }
    );
  }

  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: "Non autorisé" },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Liste les compteurs de séquence actuels
 */
export async function GET(request: NextRequest) {
  const unauthorized = checkAuthorization(request);
  if (unauthorized) return unauthorized;

  try {
    const manager = getSequenceManager();
    const sequences = await manager.getAllSequencesAsync();

    const values = Object.values(sequences);

    return NextResponse.json({
      success: true,
      storage: getSequenceManagerType(),
      prefixCount: values.length,
      totalVinsGenerated: values.reduce((sum, value) => sum + value, 0),
      sequences,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("Erreur lecture séquences:", error);

    return NextResponse.json(
      { success: false, error: reason },
      { status: 500 }
    );
  }
}

interface RaiseFloorRequest {
  floors?: Record<string, number>;
  prefix?: string;
  floor?: number;
}

/**
 * Relève un ou plusieurs compteurs à une valeur plancher
 *
 * Corps accepté:
 *   { "prefix": "LZSHCKZSTS", "floor": 500 }
 *   { "floors": { "LZSHCKZSTS": 500, "LFVCDMWRTH": 300 } }
 */
export async function POST(request: NextRequest) {
  const unauthorized = checkAuthorization(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as RaiseFloorRequest;

    // Normaliser les deux formes acceptées
    const floors: Record<string, number> = body.floors
      ? body.floors
      : body.prefix !== undefined && body.floor !== undefined
        ? { [body.prefix]: body.floor }
        : {};

    const entries = Object.entries(floors);

    if (entries.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Corps invalide. Attendu { "prefix": "...", "floor": N } ou { "floors": { "...": N } }',
        },
        { status: 400 }
      );
    }

    const manager = getSequenceManager();
    const results: {
      prefix: string;
      before: number;
      after: number;
      changed: boolean;
    }[] = [];

    for (const [prefix, floor] of entries) {
      const before = await manager.getCurrentSequenceAsync(prefix);
      const after = await manager.raiseSequenceFloorAsync(prefix, floor);

      results.push({ prefix, before, after, changed: after !== before });
    }

    const changedCount = results.filter((r) => r.changed).length;

    return NextResponse.json({
      success: true,
      storage: getSequenceManagerType(),
      message: `${changedCount} compteur(s) relevé(s) sur ${results.length} demandé(s)`,
      results,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("Erreur réamorçage séquences:", error);

    // Un plancher hors bornes est une erreur d'appel, pas une panne.
    // Les deux gestionnaires libellent le message différemment (accents ou non).
    const isValidationError =
      reason.includes("Le plancher doit") || reason.includes("séquences à réserver");

    return NextResponse.json(
      { success: false, error: reason },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
