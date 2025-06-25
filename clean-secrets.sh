#!/bin/bash

# Vérification
echo "⚠️ Ce script va supprimer définitivement le fichier .env de l'historique Git."
read -p "Continuer ? (y/n): " confirm
if [[ "$confirm" != "y" ]]; then
  echo "❌ Annulé."
  exit 1
fi

# Étape 1 : Assurer que .env est ignoré
echo ".env" >> .gitignore
git add .gitignore
git commit -m "🔒 Ajout de .env dans .gitignore"

# Étape 2 : Télécharger BFG si absent
if [ ! -f bfg.jar ]; then
  echo "⬇️ Téléchargement de BFG..."
  wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar -O bfg.jar
fi

# Étape 3 : Supprimer .env de l'historique Git
echo "🧹 Suppression de .env de l'historique avec BFG..."
java -jar bfg.jar --delete-files .env

# Étape 4 : Nettoyer le repo
echo "🧼 Nettoyage du cache Git..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Étape 5 : Forcer le push vers GitHub
echo "🚀 Push forcé vers GitHub (main)..."
git push origin main --force

echo "✅ Terminé ! Secrets supprimés de l'historique Git."
