# 🎬 TubeAI — Analyseur de chaîne YouTube propulsé par Claude AI

![TubeAI Preview](https://img.shields.io/badge/Claude-AI%20Powered-red?style=flat-square) ![YouTube](https://img.shields.io/badge/YouTube%20API-v3-red?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square) ![No Backend](https://img.shields.io/badge/No%20Backend-100%25%20Client--Side-blue?style=flat-square)

**TubeAI** est une application web 100% client-side qui analyse n'importe quelle chaîne YouTube et génère des conseils personnalisés grâce à l'IA Claude d'Anthropic. Elle t'aide aussi à créer des titres optimisés et des hashtags pour tes Shorts.

---

## ✨ Fonctionnalités

### 📊 Analyse de chaîne
- Colle n'importe quel lien YouTube (`@handle`, `/channel/UC...`, `/c/...`)
- Statistiques détaillées : abonnés, vues totales, nombre de vidéos, vues moyennes par vidéo
- Affichage des 10 dernières vidéos avec leurs stats (vues, likes, commentaires)
- Détection automatique des **Shorts** vs vidéos longues

### 🤖 Conseils IA (Claude)
- Analyse complète de ta chaîne par Claude
- Forces et points d'amélioration identifiés
- Stratégie de contenu personnalisée
- La priorité n°1 actionnable pour ta croissance

### 🎯 Générateur de titre + hashtags
- Donne une description de ta vidéo → Claude génère **3 titres optimisés CTR**
- Pour les **Shorts** : génère automatiquement **15 hashtags** pertinents
- Explication psychologique du pourquoi ces titres fonctionnent
- Copie en un clic

---

## 🚀 Installation & Utilisation

### Option 1 — Ouvrir directement dans le navigateur

```bash
git clone https://github.com/ton-username/tubeai.git
cd tubeai
# Ouvre index.html dans ton navigateur (double-clic)
```

> ⚠️ Pour que les appels à l'API Claude fonctionnent depuis un fichier local (`file://`), tu dois ouvrir le fichier via un serveur local (voir Option 2).

### Option 2 — Via un serveur local (recommandé)

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# VS Code
# Installe l'extension "Live Server" et clique sur "Go Live"
```

Puis ouvre `http://localhost:8080` dans ton navigateur.

---

## 🔑 Configuration des clés API

L'app nécessite **2 clés API** saisies directement dans l'interface :

### 1. Clé API YouTube Data v3 (gratuit)

1. Va sur [Google Cloud Console](https://console.cloud.google.com/)
2. Crée un projet → Bibliothèque d'APIs → Active **"YouTube Data API v3"**
3. Credentials → Créer des identifiants → **Clé API**
4. (Optionnel) Restreins la clé aux origines HTTP autorisées

### 2. Clé API Anthropic (Claude)

1. Crée un compte sur [console.anthropic.com](https://console.anthropic.com/)
2. Paramètres → API Keys → **Créer une clé**
3. Assure-toi d'avoir du crédit sur ton compte

> 🔒 **Sécurité** : Les clés sont stockées dans `localStorage` de ton navigateur. Elles ne sont jamais envoyées à un serveur tiers. L'app est 100% client-side.

---

## 📁 Structure du projet

```
tubeai/
├── index.html      # Structure HTML de l'application
├── style.css       # Styles (design sombre, typographie Bebas Neue)
├── app.js          # Logique principale (YouTube API + Claude API)
└── README.md       # Ce fichier
```

---

## 🛠️ Stack technique

| Technologie | Usage |
|-------------|-------|
| HTML/CSS/JS vanilla | Aucune dépendance, aucun build |
| [YouTube Data API v3](https://developers.google.com/youtube/v3) | Statistiques chaîne & vidéos |
| [Anthropic API (Claude Sonnet)](https://docs.anthropic.com/) | Conseils IA & génération de titres |
| Google Fonts (Bebas Neue + DM Sans) | Typographie |

---

## ⚙️ Fonctionnement technique

### Résolution de chaîne
L'app accepte plusieurs formats d'URL :
- `https://youtube.com/@MaChaîne`
- `https://youtube.com/channel/UCxxxxxxxx`
- `https://youtube.com/c/MaChaîne`
- `@MaChaîne` (sans URL)

### Détection des Shorts
Un Short est détecté si la durée ISO 8601 de la vidéo est ≤ 60 secondes.

### Appels API Claude
Les appels se font directement depuis le navigateur vers `api.anthropic.com/v1/messages` avec l'en-tête `anthropic-dangerous-direct-browser-access: true` (usage personnel / développement uniquement).

---

## 📋 Limitations connues

- **Quota YouTube API** : 10 000 unités/jour sur le plan gratuit. Une analyse coûte ~10-20 unités.
- **CORS Claude API** : L'accès direct depuis le navigateur nécessite l'en-tête spécifique. Pour la production, mets un backend simple (Cloudflare Worker, Vercel Edge Function...).
- **Vidéos privées** : Non accessibles via l'API publique.
- **Historique complet** : L'API récupère les 10 dernières vidéos. Modifiable dans `app.js` (paramètre `maxResults`).

---

## 🔧 Personnalisation

Dans `app.js`, tu peux modifier :
- `maxResults` dans `fetchRecentVideos()` : nombre de vidéos récupérées (max 50)
- Le modèle Claude dans `callClaude()` : `claude-sonnet-4-20250514`
- Le `max_tokens` pour des analyses plus longues

---

## 📄 Licence

MIT — Utilise, modifie, distribue librement.

---

## 🤝 Contributions

Les PRs sont les bienvenues ! Idées de features :
- [ ] Export PDF du rapport
- [ ] Comparaison de deux chaînes
- [ ] Historique des analyses
- [ ] Analyse de la concurrence
- [ ] Score de SEO par vidéo

---

*Fait avec ❤️ et Claude AI*
