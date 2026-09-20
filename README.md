# Bot Telegram — Devis & Factures B.A.G Technology Service

Un bot Telegram qui génère tes devis et factures (dans le design de ton modèle)
en PDF **et** en image, à partir d'une simple discussion. Tout tourne sur
Vercel, **entièrement gratuit** : aucune API payante, aucune carte bancaire
requise. Le bot comprend le texte grâce à des règles écrites à la main
(pas d'intelligence artificielle externe facturée à l'usage).

## Comment ça marche pour l'utilisateur

- **Mode rapide** : un seul message libre, ex.
  `"Devis pour M. Sawadogo, Kamboinsin, 70245268. Diagnostic 25000, câblage du tableau 55000"`
  → le bot comprend tout via l'IA et affiche un aperçu.
- **Mode guidé** : `/devis` ou `/facture` → le bot pose les questions une par une
  (nom du client, adresse, téléphone, prestations).
- Dans les deux cas, un **aperçu récapitulatif** est montré avec des boutons
  *Confirmer*, *Ajouter une prestation*, *Annuler* avant de générer le document final.
- Une fois confirmé : le bot renvoie l'image PNG puis le PDF, avec un numéro
  de devis/facture qui s'incrémente automatiquement (Devis n° 0007, 0008...).

## Ce dont tu as besoin avant de déployer (tout est gratuit)

1. **Un token Telegram** — tu l'as déjà (via @BotFather). ✅
2. **Un compte Vercel** (gratuit, plan Hobby) — https://vercel.com
3. **Une base Redis gratuite** (Upstash) — créée en 2 clics depuis ton
   projet Vercel, onglet *Storage*, sans carte bancaire (offre gratuite
   large pour un usage d'un ou quelques artisans).

Aucune clé d'API payante n'est nécessaire : la compréhension du texte se
fait par des règles écrites dans le code (`lib/parseText.js`), pas par un
service d'IA facturé à l'usage.

## Installation

### 1. Récupérer le projet

Télécharge le dossier `bag-invoice-bot`, puis pousse-le sur un dépôt GitHub
(privé de préférence, car il contiendra ton logo) :

```bash
cd bag-invoice-bot
git init
git add .
git commit -m "Bot devis/factures B.A.G"
gh repo create bag-invoice-bot --private --source=. --push
# ou crée le repo manuellement sur github.com puis:
# git remote add origin <url-du-repo>
# git push -u origin main
```

### 2. Déployer sur Vercel

- Va sur https://vercel.com/new, importe le dépôt GitHub.
- Vercel détecte automatiquement que c'est un projet Node avec des
  fonctions dans `api/`. Laisse les réglages par défaut et clique *Deploy*.

### 3. Ajouter le stockage (Redis gratuit)

- Dans le projet Vercel → onglet **Storage** → **Create Database** →
  choisis **Upstash** puis **Redis**, offre gratuite (aucune carte requise).
- Connecte-la à ton projet. Vercel ajoute automatiquement les variables
  `KV_REST_API_URL` et `KV_REST_API_TOKEN` (utilisées telles quelles par
  le bot).

### 4. Configurer les variables d'environnement

Dans **Settings → Environment Variables**, ajoute (voir `.env.example` pour
la liste complète et les valeurs par défaut) :

| Variable | Valeur |
|---|---|
| `TELEGRAM_BOT_TOKEN` | le token donné par @BotFather |
| `WEBHOOK_SECRET` | invente une longue chaîne aléatoire |
| `CHROMIUM_PACK_URL` | garde la valeur par défaut de `.env.example` |
| `COMPANY_*` et `PAYMENT_*` | tes infos d'entreprise (déjà pré-remplies avec tes infos actuelles dans `lib/company.js`, à ajuster si besoin) |

Redéploie ensuite le projet pour que les variables soient prises en compte
(**Deployments → ⋯ → Redeploy**).

### 5. Enregistrer le webhook auprès de Telegram

Une fois déployé, tu as une URL du type `https://bag-invoice-bot.vercel.app`.
En local, avec Node 18+ :

```bash
export TELEGRAM_BOT_TOKEN=xxxxx
export WEBHOOK_SECRET=xxxxx   # la même valeur que sur Vercel
node scripts/set-webhook.js https://bag-invoice-bot.vercel.app
```

Tu dois voir `"ok": true` dans la réponse. Ton bot est en ligne 🎉

Teste-le sur Telegram avec `/start`.

## Tester en local

Trois façons, de la plus rapide à la plus complète.

### 1. Vérifier juste le rendu du devis (le plus rapide)

Sans toucher à Telegram : génère un devis d'exemple en HTML/PDF/PNG dans un
dossier `preview/`, pratique pour ajuster le gabarit (`templates/invoice.js`)
ou vérifier le logo.

```bash
npm install
npm run preview
```

Ouvre ensuite `preview/devis.html` dans ton navigateur (aperçu instantané,
sans Chromium), ou `preview/devis.pdf` / `preview/devis.png` (rendu final,
via Chromium — voir la remarque OS ci-dessous).

### 2. Discuter avec le bot en local (recommandé)

Le bot tourne directement sur ta machine et interroge Telegram lui-même
(long polling), donc **pas besoin de tunnel ni de déployer** :

```bash
cp .env.example .env
# remplis au moins TELEGRAM_BOT_TOKEN, KV_REST_API_URL, KV_REST_API_TOKEN
# (crée une base Redis gratuite sur https://console.upstash.com si tu n'as
# pas encore connecté Upstash à Vercel)

npm install
npm run dev
```

Puis va discuter avec ton bot sur Telegram normalement (`/start`, `/devis`,
etc.) — les messages arrivent directement sur ta machine. `Ctrl+C` pour
arrêter. Tant que ce script tourne, ne configure **pas** de webhook en même
temps (les deux modes sont incompatibles) : si tu avais déjà fait
`node scripts/set-webhook.js`, exécute d'abord
`node -e "require('dotenv').config(); fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/deleteWebhook').then(r=>r.json()).then(console.log)"`
pour repasser en mode polling.

### 3. Simuler exactement l'environnement Vercel (webhook + tunnel)

Pour tester le comportement webhook tel qu'il sera en production :

```bash
npm install -g vercel   # une fois
vercel dev              # démarre les fonctions sur http://localhost:3000
```

Dans un autre terminal, ouvre un tunnel public gratuit (ex.
[ngrok](https://ngrok.com)) :

```bash
ngrok http 3000
```

Puis pointe Telegram vers l'URL ngrok obtenue :

```bash
export TELEGRAM_BOT_TOKEN=xxxxx
export WEBHOOK_SECRET=xxxxx
node scripts/set-webhook.js https://xxxx.ngrok-free.app
```

N'oublie pas de repointer le webhook vers ton URL Vercel réelle une fois le
test terminé (`node scripts/set-webhook.js https://ton-projet.vercel.app`).

### Remarque sur le rendu PDF/PNG en local (macOS/Windows)

`@sparticuz/chromium-min` télécharge un Chromium optimisé pour
l'environnement Linux de Vercel. Sur Linux, ça fonctionne aussi en local.
Sur macOS/Windows, le binaire peut refuser de s'exécuter (erreur du type
"exec format error"). Dans ce cas : la conversation avec le bot fonctionne
quand même (`npm run dev`), seule la génération finale du PDF/PNG échouera
en local — teste-la une fois déployée sur Vercel (gratuit, voir plus haut),
ou lance le projet dans un conteneur/VM Linux (WSL sur Windows, Docker) si
tu veux absolument tout tester en local.

## Personnaliser le modèle



- **Logo / infos entreprise** : `lib/company.js` (ou via variables
  d'environnement `COMPANY_*`).
- **Mise en page du devis/facture** : `templates/invoice.js` — c'est du
  HTML/CSS classique, facile à ajuster (couleurs, polices, disposition).
- **Numérotation** : séparée entre devis et factures, stockée dans Vercel KV.
  Pour repartir de zéro, supprime les clés `counter:devis` / `counter:facture`
  dans le tableau de bord Vercel KV.

## Limites de l'analyseur de texte gratuit

Sans IA, la compréhension du message repose sur des motifs simples :
- Le nom du client doit suivre le mot **"pour"** ou **"client"**
  (ex. `"Devis pour M. Sawadogo, ..."`).
- Le numéro de téléphone (8 chiffres, avec ou sans `+226`) marque la fin
  des infos client.
- Chaque prestation doit être séparée par une **virgule**, avec le prix à
  la fin (ex. `"Câblage du tableau électrique 55000"`), et une quantité
  optionnelle en `x2`.
- `"TVA 18%"` quelque part dans le message règle le taux de TVA.

Si une phrase est mal comprise, l'aperçu avant génération permet de le
repérer avant d'envoyer le document final ; sinon, autant utiliser le
**mode guidé** (`/devis`, `/facture`) qui pose les questions une par une
et est beaucoup plus fiable.

## Limites à connaître

- La génération PDF/PNG utilise un vrai navigateur headless (Chromium) —
  cela prend quelques secondes. `vercel.json` autorise jusqu'à 60s
  d'exécution ; sur le plan **Hobby** gratuit, Vercel peut plafonner cette
  durée selon les évolutions de leurs limites : si tu vois des erreurs de
  timeout, passe au plan Pro ou réduis la complexité du template.
- Les données (numéro de devis en cours, conversations en cours) sont
  stockées dans Vercel KV — ne supprime pas cette base une fois en usage.
