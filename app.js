/* ======================
   TubeAI — Application
   ====================== */

// ── KEYS MANAGEMENT ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function loadKeys() {
  $('ytKey').value = localStorage.getItem('tubeai_yt_key') || '';
  $('claudeKey').value = localStorage.getItem('tubeai_claude_key') || '';
}

$('saveKeys').addEventListener('click', () => {
  const yt = $('ytKey').value.trim();
  const cl = $('claudeKey').value.trim();
  if (!yt || !cl) { showToast('⚠️ Remplis les deux clés !'); return; }
  localStorage.setItem('tubeai_yt_key', yt);
  localStorage.setItem('tubeai_claude_key', cl);
  showToast('✅ Clés sauvegardées !');
});

function getKeys() {
  return {
    yt: localStorage.getItem('tubeai_yt_key') || '',
    claude: localStorage.getItem('tubeai_claude_key') || ''
  };
}

// ── UTILS ────────────────────────────────────────────────────────────
function formatNumber(n) {
  n = parseInt(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(msg, duration = 2800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function setLoading(visible, msg = 'Chargement...') {
  $('loading').hidden = !visible;
  $('loadingMsg').textContent = msg;
}

async function copyText(text, btn) {
  await navigator.clipboard.writeText(text);
  const orig = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => (btn.textContent = orig), 1500);
  showToast('📋 Copié !');
}

// ── EXTRACT CHANNEL ID / HANDLE ──────────────────────────────────────
function parseChannelUrl(url) {
  url = url.trim();
  // @handle
  const handleMatch = url.match(/youtube\.com\/@([^/?&]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };
  // /channel/UCxxx
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelMatch) return { type: 'id', value: channelMatch[1] };
  // /c/name or /user/name
  const cMatch = url.match(/youtube\.com\/(?:c|user)\/([^/?&]+)/);
  if (cMatch) return { type: 'handle', value: cMatch[1] };
  // plain @handle
  if (url.startsWith('@')) return { type: 'handle', value: url.slice(1) };
  return null;
}

// ── YOUTUBE API ──────────────────────────────────────────────────────
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytFetch(endpoint, params, key) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function resolveChannelId(parsed, key) {
  if (parsed.type === 'id') return parsed.value;
  // Try search by handle/username
  const data = await ytFetch('search', {
    part: 'snippet', type: 'channel', q: parsed.value, maxResults: 1
  }, key);
  if (data.items && data.items.length > 0) {
    return data.items[0].snippet.channelId;
  }
  throw new Error('Chaîne introuvable. Vérifie le lien.');
}

async function fetchChannelStats(channelId, key) {
  return ytFetch('channels', {
    part: 'snippet,statistics,brandingSettings',
    id: channelId
  }, key);
}

async function fetchRecentVideos(channelId, key, maxResults = 10) {
  // Get uploads playlist
  const ch = await ytFetch('channels', { part: 'contentDetails', id: channelId }, key);
  const uploadsId = ch.items[0].contentDetails.relatedPlaylists.uploads;

  const pl = await ytFetch('playlistItems', {
    part: 'snippet,contentDetails', playlistId: uploadsId, maxResults
  }, key);

  const videoIds = pl.items.map(i => i.contentDetails.videoId).join(',');
  const details = await ytFetch('videos', {
    part: 'snippet,statistics,contentDetails', id: videoIds
  }, key);

  return details.items;
}

// Determine if video is a Short (duration <= 60s and typically vertical)
function isShort(video) {
  const dur = video.contentDetails.duration; // ISO 8601
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return false;
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  return h === 0 && m === 0 && s <= 60;
}

// ── RENDER CHANNEL CARD ──────────────────────────────────────────────
function renderChannelCard(ch) {
  const s = ch.snippet;
  const st = ch.statistics;
  const thumb = s.thumbnails?.high?.url || s.thumbnails?.default?.url || '';
  $('channelCard').innerHTML = `
    <img class="channel-thumb" src="${thumb}" alt="${s.title}" />
    <div class="channel-info">
      <div class="channel-name">${s.title}</div>
      <div class="channel-handle">@${s.customUrl || s.title}</div>
      <div class="channel-desc">${s.description || 'Aucune description.'}</div>
      <div class="channel-country">${s.country ? '🌍 ' + s.country : ''} · Créée le ${formatDate(s.publishedAt)}</div>
    </div>
  `;
}

// ── RENDER STATS ─────────────────────────────────────────────────────
function renderStats(stats) {
  const avgViews = stats.videoCount > 0
    ? Math.round(parseInt(stats.viewCount) / parseInt(stats.videoCount))
    : 0;

  const cards = [
    { icon: '👥', value: formatNumber(stats.subscriberCount), label: 'Abonnés', delta: null },
    { icon: '▶️', value: formatNumber(stats.viewCount), label: 'Vues totales', delta: null },
    { icon: '🎬', value: formatNumber(stats.videoCount), label: 'Vidéos publiées', delta: null },
    { icon: '📊', value: formatNumber(avgViews), label: 'Vues moy. / vidéo', delta: null },
  ];

  $('statsGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
}

// ── RENDER VIDEOS ────────────────────────────────────────────────────
function renderVideos(videos) {
  $('videosList').innerHTML = videos.map(v => {
    const s = v.snippet;
    const st = v.statistics;
    const short = isShort(v);
    const thumb = s.thumbnails?.medium?.url || '';
    return `
      <div class="video-item">
        <img class="video-thumb" src="${thumb}" alt="${s.title}" loading="lazy" />
        <div class="video-info">
          <div class="video-title">${s.title}</div>
          <div class="video-meta">
            <span>👁 ${formatNumber(st.viewCount)}</span>
            <span>👍 ${formatNumber(st.likeCount)}</span>
            <span>💬 ${formatNumber(st.commentCount)}</span>
            <span>📅 ${formatDate(s.publishedAt)}</span>
          </div>
        </div>
        <span class="video-badge ${short ? 'short' : 'long'}">${short ? 'Short' : 'Vidéo'}</span>
      </div>
    `;
  }).join('');
}

// ── CLAUDE API ───────────────────────────────────────────────────────
async function callClaude(messages, claudeKey, maxTokens = 1200) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(b => b.text || '').join('');
}

// ── RENDER AI ADVICE ─────────────────────────────────────────────────
function renderAiAdvice(markdown) {
  // Basic markdown → HTML
  let html = markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])(.+)$/gm, (m, p) => p ? `<p>${p}</p>` : m);
  $('aiContent').innerHTML = html;
}

// ── ANALYZE CHANNEL ──────────────────────────────────────────────────
$('analyzeBtn').addEventListener('click', analyzeChannel);
$('channelUrl').addEventListener('keydown', e => { if (e.key === 'Enter') analyzeChannel(); });

async function analyzeChannel() {
  const { yt, claude } = getKeys();
  if (!yt) { showToast('❗ Ajoute ta clé YouTube dans la section Config'); return; }
  if (!claude) { showToast('❗ Ajoute ta clé Claude dans la section Config'); return; }

  const url = $('channelUrl').value.trim();
  if (!url) { showToast('⚠️ Colle un lien YouTube !'); return; }

  const parsed = parseChannelUrl(url);
  if (!parsed) { showToast('❌ Lien invalide. Ex: youtube.com/@MaChaîne'); return; }

  $('results').hidden = true;
  setLoading(true, 'Résolution de la chaîne...');

  try {
    setLoading(true, 'Récupération des infos de la chaîne...');
    const channelId = await resolveChannelId(parsed, yt);

    setLoading(true, 'Chargement des statistiques...');
    const [chData, videos] = await Promise.all([
      fetchChannelStats(channelId, yt),
      fetchRecentVideos(channelId, yt, 10)
    ]);

    if (!chData.items || chData.items.length === 0) {
      throw new Error('Chaîne introuvable.');
    }

    const ch = chData.items[0];
    setLoading(false);

    // Render
    $('results').hidden = false;
    renderChannelCard(ch);
    renderStats(ch.statistics);
    renderVideos(videos);

    // Scroll to results
    setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    // AI analysis (async, no loading block)
    $('aiBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    generateAiAdvice(ch, videos, claude);

  } catch (err) {
    setLoading(false);
    showToast('❌ ' + err.message, 4000);
    console.error(err);
  }
}

async function generateAiAdvice(ch, videos, claudeKey) {
  const stats = ch.statistics;
  const avgViews = stats.videoCount > 0
    ? Math.round(parseInt(stats.viewCount) / parseInt(stats.videoCount))
    : 0;

  const videoSummary = videos.slice(0, 5).map(v => ({
    titre: v.snippet.title,
    vues: v.statistics.viewCount,
    likes: v.statistics.likeCount,
    short: isShort(v)
  }));

  const prompt = `Tu es un expert en croissance de chaînes YouTube. Analyse cette chaîne et donne des conseils détaillés et actionnables.

DONNÉES DE LA CHAÎNE :
- Nom : ${ch.snippet.title}
- Description : ${ch.snippet.description?.slice(0, 300) || 'N/A'}
- Abonnés : ${stats.subscriberCount}
- Vues totales : ${stats.viewCount}
- Nombre de vidéos : ${stats.videoCount}
- Vues moyennes par vidéo : ${avgViews}
- Pays : ${ch.snippet.country || 'N/A'}
- Date de création : ${ch.snippet.publishedAt}

DERNIÈRES VIDÉOS (5 premières) :
${JSON.stringify(videoSummary, null, 2)}

Fournis une analyse structurée avec :
1. **Résumé de la chaîne** (forces, positionnement)
2. **Points forts** (ce qui fonctionne bien)
3. **Axes d'amélioration** (3-5 conseils précis et actionnables)
4. **Stratégie de contenu** recommandée (fréquence, formats, sujets)
5. **Taux d'engagement estimé** et ce que ça signifie
6. **Priorité n°1** : l'action la plus importante à faire maintenant

Réponds en français, sois direct et percutant. N'utilise pas de formules génériques, base-toi sur les vraies données.`;

  try {
    const advice = await callClaude([{ role: 'user', content: prompt }], claudeKey, 1500);
    renderAiAdvice(advice);
  } catch (err) {
    $('aiContent').innerHTML = `<p style="color:#ff6b6b">Erreur Claude : ${err.message}</p>`;
  }
}

// ── VIDEO TITLE + HASHTAG GENERATOR ─────────────────────────────────
let contentType = 'video';

$('btnVideo').addEventListener('click', () => {
  contentType = 'video';
  $('btnVideo').classList.add('active');
  $('btnShort').classList.remove('active');
});

$('btnShort').addEventListener('click', () => {
  contentType = 'short';
  $('btnShort').classList.add('active');
  $('btnVideo').classList.remove('active');
});

$('generateBtn').addEventListener('click', generateTitleAndTags);

async function generateTitleAndTags() {
  const { claude } = getKeys();
  if (!claude) { showToast('❗ Ajoute ta clé Claude dans la section Config'); return; }

  const desc = $('videoDesc').value.trim();
  if (!desc) { showToast('⚠️ Décris ta vidéo !'); return; }

  const niche = $('channelNiche').value.trim();
  const lang = $('outputLang').value;
  const isShortContent = contentType === 'short';

  $('generateBtn').disabled = true;
  $('generateBtn').textContent = 'Claude génère... ✨';
  $('genOutput').hidden = true;

  const prompt = `Tu es un expert en optimisation YouTube et en copywriting viral.

TYPE DE CONTENU : ${isShortContent ? 'YouTube SHORT (format vertical, max 60 secondes)' : 'Vidéo YouTube longue'}
NICHE / DOMAINE : ${niche || 'Non précisé'}
SUJET DE LA VIDÉO : ${desc}
LANGUE DE SORTIE : ${lang}

Ta mission :
1. Génère EXACTEMENT 3 titres YouTube optimisés pour le CTR (Click-Through Rate).
   - Pour une vidéo longue : entre 40 et 70 caractères, accrocheurs, avec émotion ou curiosité
   - Pour un Short : entre 30 et 50 caractères, percutant, ultra-direct
   - Chaque titre sur une nouvelle ligne, préfixé par "TITRE: "

${isShortContent ? `2. Génère EXACTEMENT 15 hashtags optimisés pour les Shorts YouTube.
   - Mélange hashtags génériques populaires + hashtags de niche
   - Chaque hashtag sur une nouvelle ligne, préfixé par "TAG: "

` : ''}3. Explique en 2-3 phrases POURQUOI ces titres fonctionnent (psychologie, SEO, curiosity gap...).
   Préfixe cette section par "EXPLICATION: "

Réponds UNIQUEMENT avec ce format structuré, rien d'autre avant ou après.`;

  try {
    const result = await callClaude([{ role: 'user', content: prompt }], claude, 1000);
    parseAndRenderGenOutput(result, isShortContent);
  } catch (err) {
    showToast('❌ Erreur Claude : ' + err.message, 4000);
  } finally {
    $('generateBtn').disabled = false;
    $('generateBtn').textContent = 'Générer avec Claude AI ✨';
  }
}

function parseAndRenderGenOutput(text, isShortContent) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const titles = lines.filter(l => l.startsWith('TITRE:')).map(l => l.replace('TITRE:', '').trim());
  const tags = lines.filter(l => l.startsWith('TAG:')).map(l => l.replace('TAG:', '').trim());
  const explication = lines.filter(l => l.startsWith('EXPLICATION:')).map(l => l.replace('EXPLICATION:', '').trim()).join(' ');

  // Render titles
  $('genTitles').innerHTML = titles.length
    ? titles.map(t => `
        <div class="gen-title-item">
          <span>${t}</span>
          <button class="copy-btn" onclick="copyText('${t.replace(/'/g,"\\'")}', this)">📋</button>
        </div>
      `).join('')
    : '<p style="color:#888">Aucun titre généré. Réessaie.</p>';

  // Hashtags
  const hashSection = $('hashtagSection');
  if (isShortContent && tags.length > 0) {
    hashSection.hidden = false;
    $('genHashtags').innerHTML = tags.map(h => `
      <span class="hashtag-pill" onclick="copyText('${h}', this)">${h}</span>
    `).join('');
  } else {
    hashSection.hidden = true;
  }

  // Explanation
  $('genExplanation').textContent = explication || 'Aucune explication fournie.';

  $('genOutput').hidden = false;
  $('genOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── INIT ─────────────────────────────────────────────────────────────
loadKeys();
console.log('%cTubeAI 🎬', 'font-size:24px; color:#ff2d2d; font-weight:bold');
console.log('Tes clés API sont stockées dans localStorage et ne quittent jamais ton navigateur.');
