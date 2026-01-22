"use client";

import { useState, useRef, useCallback } from "react";

/**
 * Pattern regex pour valider le format du nom de fichier côté client
 */
const TEMPLATE_FILENAME_PATTERN =
  /^(\d+)-POSITIONS?-(\d+)-POIDS-([\w-]+)\.xml$/i;

/**
 * Taille maximale du fichier (5 MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface TemplateUploadProps {
  onUploadSuccess: () => void;
}

export function TemplateUpload({ onUploadSuccess }: TemplateUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Valide le fichier côté client
   */
  const validateFile = useCallback((file: File): string | null => {
    // Vérifier la taille
    if (file.size > MAX_FILE_SIZE) {
      const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
      const actualSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return `Le fichier est trop volumineux (${actualSizeMB} MB). Taille maximale: ${maxSizeMB} MB`;
    }

    // Vérifier l'extension
    if (!file.name.toLowerCase().endsWith(".xml")) {
      return "Le fichier doit avoir l'extension .xml";
    }

    // Vérifier le format du nom
    if (!TEMPLATE_FILENAME_PATTERN.test(file.name)) {
      return "Format de nom invalide. Format attendu: {N}-POSITIONS-{POIDS}-POIDS-{TYPE}.xml";
    }

    return null;
  }, []);

  /**
   * Gère la sélection d'un fichier
   */
  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      setError(null);
      setSuccess(null);

      if (!selectedFile) {
        setFile(null);
        return;
      }

      const validationError = validateFile(selectedFile);
      if (validationError) {
        setError(validationError);
        setFile(null);
        return;
      }

      setFile(selectedFile);
    },
    [validateFile]
  );

  /**
   * Gère le drag and drop
   */
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    },
    [handleFileSelect]
  );

  /**
   * Gère le changement dans l'input file
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    },
    [handleFileSelect]
  );

  /**
   * Ouvre le sélecteur de fichier
   */
  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Upload le fichier vers l'API
   */
  const handleUpload = async () => {
    if (!file) {
      setError("Aucun fichier sélectionné");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("template", file);

      const response = await fetch("/api/templates/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(
          `Template "${data.template.filename}" uploadé avec succès (${data.template.positionCount} positions)`
        );
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        onUploadSuccess();
      } else {
        setError(data.error || "Erreur lors de l'upload");
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setUploading(false);
    }
  };

  /**
   * Annule la sélection
   */
  const handleCancel = useCallback(() => {
    setFile(null);
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Zone de drag-and-drop */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleButtonClick}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
            : file
              ? "border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-900/20"
              : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          onChange={handleChange}
          className="hidden"
        />

        {file ? (
          <div className="space-y-2">
            <svg
              className="mx-auto h-10 w-10 text-green-500 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {file.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <svg
              className="mx-auto h-10 w-10 text-zinc-400 dark:text-zinc-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-blue-600 dark:text-blue-400">
                Cliquez
              </span>{" "}
              ou glissez un fichier XML ici
            </p>
          </div>
        )}
      </div>

      {/* Informations sur le format */}
      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        <p>
          Format:{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-700">
            {"{N}"}-POSITIONS-{"{POIDS}"}-POIDS-{"{TYPE}"}.xml
          </code>
        </p>
        <p>Taille max: 5 MB</p>
      </div>

      {/* Messages d'erreur/succès */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {success}
        </div>
      )}

      {/* Boutons d'action */}
      {file && (
        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:focus:ring-offset-zinc-800"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
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
                Upload en cours...
              </span>
            ) : (
              "Envoyer le template"
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={uploading}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:focus:ring-offset-zinc-800"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
