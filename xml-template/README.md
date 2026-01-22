# XML Templates (Development Only)

Ce dossier est utilisé uniquement en **développement local**.

## Production

En production, les templates sont stockés dans **Vercel Blob** et ce dossier n'est pas utilisé.

## Développement

Placez vos fichiers XML de test dans ce dossier pour le développement local.

### Format de nom requis

```
{N}-POSITIONS-{POIDS}-POIDS-{TYPE}.xml
```

Exemples :
- `70-POSITIONS-530-POIDS-MOTO.xml`
- `140-POSITIONS-1039-POIDS-TRICYCLE.xml`

### Structure XML requise

Le template doit contenir des balises `<Marks2_of_packages>` correspondant au nombre N dans le nom du fichier.
