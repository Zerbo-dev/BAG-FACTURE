# B.A.G Invoice Bot

Bot Telegram de **B.A.G Technology Service** permettant de créer des devis, des factures et des factures proforma à partir d'une conversation. Les documents sont générés en **PDF** et en **image PNG**, puis peuvent être archivés dans Redis et dans un canal Telegram.

Le projet est conçu pour fonctionner localement avec le long polling Telegram ou en production comme fonction serverless sur Vercel.

## Fonctionnalités

- Création de trois types de documents :
  - devis ;
  - facture ;
  - facture proforma.
- Deux modes de saisie :
  - mode guidé avec `/devis`, `/facture` ou `/proforma` ;
  - mode libre à partir d'un message contenant le client, les prestations et les prix.
- Aperçu avant génération avec boutons de confirmation, annulation et gestion des prestations.
- Ajout, modification et suppression de prestations.
- Gestion des quantités et calcul des totaux HT, TVA et TTC.
- Sélection de plusieurs modes de paiement pour les factures :
  - virement bancaire ;
  - Orange Money ;
  - espèces.
- Ajout de conditions générales et d'une garantie.
- Numérotation automatique par type de document et par année.
- Génération d'un PDF multipage et d'un aperçu PNG.
- Archivage optionnel dans un canal Telegram.
- Conservation des conversations et des documents dans Upstash Redis.

## Exemple d'utilisation

Message libre :

```text
Devis pour M. Sawadogo, Kamboinsin, 70245268.
Diagnostic 25000, câblage du tableau électrique 55000 x2
```

Le bot extrait le type de document, le client, l'adresse, le téléphone, les prestations, les prix et les quantités, puis demande les informations manquantes avant d'afficher un aperçu.

Commandes disponibles :

```text
/start      Afficher l'aide et les modes de fonctionnement
/devis      Créer un devis en mode guidé
/facture    Créer une facture en mode guidé
/proforma   Créer une facture proforma en mode guidé
/annuler    Annuler la conversation en cours
```

## Architecture

```text
api/
  webhook.js             Point d'entrée Vercel pour les mises à jour Telegram

dev.js                   Démarrage local du bot en long polling

lib/
  bot.js                 Commandes Telegram, parcours guidé et génération
  parseText.js           Extraction locale par expressions régulières
  state.js               État des conversations, compteurs et archivage Redis
  render.js              Rendu HTML vers PDF et PNG avec Chromium
  company.js              Coordonnées, logo, signature et paiement

templates/
  invoice.js             Modèle HTML/CSS des devis et factures

scripts/
  preview.js             Génération locale d'un document d'exemple
  set-webhook.js         Configuration du webhook Telegram

assets/
  logo.png               Logo du projet

vercel.json              Configuration de la fonction serverless
package.json             Scripts et dépendances Node.js
```

### Flux de génération

1. Telegram transmet un message au bot.
2. `lib/bot.js` démarre ou poursuit une conversation.
3. `lib/parseText.js` extrait les données d'un message libre ou d'une ligne de prestation.
4. `lib/state.js` sauvegarde temporairement la conversation dans Upstash Redis.
5. L'utilisateur vérifie l'aperçu et confirme la génération.
6. `templates/invoice.js` construit le document HTML/CSS.
7. `lib/render.js` utilise Chromium headless pour produire le PDF et le PNG.
8. Le bot renvoie les fichiers dans Telegram et sauvegarde les métadonnées dans Redis.

## Technologies

- Node.js 18 ou supérieur
- JavaScript CommonJS
- [Telegraf](https://telegraf.js.org/) pour Telegram
- [Upstash Redis](https://upstash.com/) pour le stockage
- [Puppeteer Core](https://pptr.dev/) pour le rendu
- [Chromium](https://github.com/Sparticuz/chromium) pour la génération PDF/PNG
- [Vercel](https://vercel.com/) pour le déploiement serverless

## Installation

### Prérequis

- Node.js 18 ou supérieur ;
- un bot Telegram créé avec [@BotFather](https://t.me/BotFather) ;
- une base Redis Upstash ;
- npm.

Installer les dépendances :

```bash
npm install
```

## Variables d'environnement

Créer un fichier `.env` en développement local ou configurer ces variables dans Vercel :

```dotenv
TELEGRAM_BOT_TOKEN=token_fourni_par_botfather
WEBHOOK_SECRET=une_chaine_secrete_longue

KV_REST_API_URL=https://votre-instance.upstash.io
KV_REST_API_TOKEN=votre_token_upstash

# Optionnel selon la configuration Upstash
UPSTASH_REDIS_REST_URL=https://votre-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=votre_token_upstash

# URL d'un package Chromium compatible avec l'environnement cible
CHROMIUM_PACK_URL=

# Informations de l'entreprise
COMPANY_NAME=B.A.G TECHNOLOGY SERVICE
COMPANY_ADDRESS=Wayalghin, Ouaga, BF
COMPANY_PHONE=+226 76 46 81 88
COMPANY_EMAIL=servicesglobaltechnology44@gmail.com
COMPANY_RCCM=BF-OUA-01-2026-A10-01509
COMPANY_IFU=00299226F
COMPANY_SOCIAL_SECURITY=1492247B

# Informations de paiement
PAYMENT_BANK_ACCOUNT=4724 2300 3797 0761
PAYMENT_ORANGE_MONEY=+226 76-46-81-88
TERMS_AND_CONDITIONS=Ce devis est valable 1 mois a compter de sa date d'emission

# Optionnel : canal Telegram d'archivage
ARCHIVE_CHANNEL_ID=
```

Ne jamais versionner le fichier `.env` ni publier les tokens Telegram, Redis ou webhook.

## Lancement local

Le mode local utilise le **long polling** Telegram :

```bash
npm run dev
```

Le bot doit disposer au minimum de `TELEGRAM_BOT_TOKEN`, `KV_REST_API_URL` et `KV_REST_API_TOKEN`.

Le long polling et le webhook ne doivent pas être actifs en même temps. Pour supprimer un webhook existant :

```bash
node -e "require('dotenv').config(); fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/deleteWebhook').then(r=>r.json()).then(console.log)"
```

## Prévisualisation d'un document

Pour générer un exemple sans passer par Telegram :

```bash
npm run preview
```

Les fichiers sont créés dans `preview/` :

```text
preview/devis.html
preview/devis.pdf
preview/devis.png
```

Le HTML peut être ouvert directement dans un navigateur. La génération PDF/PNG utilise Chromium et fonctionne idéalement sur Linux ou dans l'environnement Vercel. Sur macOS ou Windows, le binaire Chromium peut nécessiter WSL, Docker ou un déploiement Vercel.

## Déploiement sur Vercel

1. Importer le dépôt dans Vercel.
2. Créer une base Upstash Redis et la connecter au projet.
3. Ajouter les variables d'environnement dans les paramètres Vercel.
4. Déployer le projet.
5. Configurer le webhook Telegram.

Le script suivant enregistre automatiquement `/api/webhook` :

```bash
export TELEGRAM_BOT_TOKEN=xxxxx
export WEBHOOK_SECRET=xxxxx
node scripts/set-webhook.js https://votre-projet.vercel.app
```

Le webhook final sera :

```text
https://votre-projet.vercel.app/api/webhook
```

La fonction serverless est configurée dans `vercel.json` avec :

- une durée maximale de 60 secondes ;
- 1024 Mo de mémoire.

## Analyse des messages

L'analyse est locale et ne dépend pas d'une API d'intelligence artificielle payante. Le parser reconnaît notamment :

- les types `devis`, `facture` et `proforma` ;
- les clients introduits par `pour` ou `client` ;
- les téléphones burkinabè à huit chiffres, avec ou sans `+226` ;
- les prestations séparées par des virgules, points-virgules ou retours à la ligne ;
- les prix en francs CFA ;
- les quantités avec `x2`, `*2` ou dans le format `Description (75000F).5` ;
- la TVA avec une syntaxe comme `TVA 18%`.

Pour obtenir le meilleur résultat, utiliser un format explicite :

```text
Facture pour Awa Traoré, Ouagadougou, 78123456.
Installation 40000, maintenance 15000 x2, TVA 18%
```

Si le message est ambigu, le mode guidé est recommandé.

## Personnalisation du document

Les principales personnalisations se trouvent dans :

- `lib/company.js` pour les coordonnées et informations de paiement ;
- `templates/invoice.js` pour le HTML, le CSS, les couleurs, les dimensions et la pagination ;
- `assets/logo.png` pour le logo source.

Le logo et la signature utilisés par le modèle sont actuellement intégrés sous forme de données base64 dans `lib/company.js`.

## Stockage Redis

Les conversations temporaires utilisent des clés de la forme :

```text
conv:<chatId>
```

Elles expirent après six heures.

Les compteurs de documents utilisent des clés de la forme :

```text
counter:<type>:<année>
```

Les documents archivés utilisent notamment :

```text
invoice:<numéro>
invoices:index
```

Les identifiants de fichiers Telegram sont conservés afin de pouvoir réutiliser les fichiers archivés sans régénérer le document.

## Scripts npm

```bash
npm run dev       # démarrer le bot localement avec long polling
npm run preview   # générer un exemple HTML/PDF/PNG
npm run set-webhook -- https://votre-projet.vercel.app
```

## Limites connues

- L'analyseur local est prévisible et gratuite, mais moins souple qu'un modèle de langage.
- Les prestations doivent idéalement contenir un prix clairement identifiable.
- La génération PDF/PNG lance Chromium et peut prendre plusieurs secondes.
- Le PNG envoyé comme aperçu représente uniquement la première page ; le PDF contient toutes les pages.
- La durée maximale d'exécution Vercel est limitée à 60 secondes par `vercel.json`.
- Aucune suite de tests automatisés n'est actuellement définie dans `package.json`.
- Le fichier `lib/llmExtract.js` est un ancien extracteur Anthropic non utilisé par le flux actuel ; le bot utilise `lib/parseText.js`.

## Sécurité

- Garder le dépôt privé si le logo, la signature ou les informations commerciales ne doivent pas être publics.
- Ne jamais committer `.env` ou des secrets.
- Activer `WEBHOOK_SECRET` en production.
- Limiter les permissions du bot dans le canal d'archivage.
- Protéger l'accès à la base Upstash Redis.

## Licence

Aucune licence open source n'est actuellement déclarée dans le dépôt. Tous droits réservés à B.A.G Technology Service, sauf indication contraire.