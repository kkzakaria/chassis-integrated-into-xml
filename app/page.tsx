"use client";

import { useState, useEffect } from "react";

interface Template {
  filename: string;
  positionCount: number;
  fileSizeKB: number;
}

interface GenerationConfig {
  wmi: string;
  vds: string;
  year: number;
  plantCode: string;
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<GenerationConfig>({
    wmi: "",
    vds: "",
    year: new Date().getFullYear(),
    plantCode: "",
  });

  // Charger les templates au démarrage
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await fetch("/api/templates");
      const data = await response.json();

      if (data.success) {
        setTemplates(data.templates);
        if (data.templates.length > 0) {
          setSelectedTemplate(data.templates[0].filename);
        }
      } else {
        setError("Erreur lors du chargement des templates");
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      setError("Veuillez sélectionner un template");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: selectedTemplate,
          ...config,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Créer et télécharger le fichier
        const blob = new Blob([data.xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setSuccess(`${data.metadata.vinCount} VINs générés et fichier téléchargé`);
      } else {
        setError(data.error || "Erreur lors de la génération");
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplateInfo = templates.find(
    (t) => t.filename === selectedTemplate
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Générateur de Châssis VIN
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Sélectionnez un template XML et générez les numéros de châssis
          </p>
        </header>

        {/* Main Content */}
        <div className="rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-800">
          {/* Template Selection */}
          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Template XML
            </label>
            {loadingTemplates ? (
              <div className="flex h-12 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700">
                <span className="text-zinc-500">Chargement...</span>
              </div>
            ) : (
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {templates.map((template) => (
                  <option key={template.filename} value={template.filename}>
                    {template.filename} ({template.positionCount} positions)
                  </option>
                ))}
              </select>
            )}

            {selectedTemplateInfo && (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {selectedTemplateInfo.positionCount} VINs seront générés
                ({selectedTemplateInfo.fileSizeKB} KB)
              </p>
            )}
          </div>

          {/* Configuration (optionnelle) */}
          <div className="mb-8">
            <h3 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Configuration VIN <span className="font-normal text-zinc-500">(optionnel - valeurs aléatoires si vide)</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-600 dark:text-zinc-400">
                  WMI (3 car.)
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={config.wmi}
                  placeholder="Aléatoire"
                  onChange={(e) =>
                    setConfig({ ...config, wmi: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-zinc-600 dark:text-zinc-400">
                  VDS (5 car.)
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={config.vds}
                  placeholder="Aléatoire"
                  onChange={(e) =>
                    setConfig({ ...config, vds: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-zinc-600 dark:text-zinc-400">
                  Année
                </label>
                <input
                  type="number"
                  min={2001}
                  max={2030}
                  value={config.year}
                  onChange={(e) =>
                    setConfig({ ...config, year: parseInt(e.target.value) || new Date().getFullYear() })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-zinc-600 dark:text-zinc-400">
                  Code Usine
                </label>
                <input
                  type="text"
                  maxLength={1}
                  value={config.plantCode}
                  placeholder="Aléatoire"
                  onChange={(e) =>
                    setConfig({ ...config, plantCode: e.target.value.toUpperCase() })
                  }
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 rounded-lg bg-green-50 p-4 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              {success}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !selectedTemplate}
            className="w-full rounded-lg bg-blue-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:focus:ring-offset-zinc-800"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Génération en cours...
              </span>
            ) : (
              "Générer et Télécharger XML"
            )}
          </button>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Les VINs générés sont conformes à la norme ISO 3779
        </footer>
      </div>
    </div>
  );
}
