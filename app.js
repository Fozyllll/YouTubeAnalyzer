/* ======================
   TubeAI v2 — Application
   Propulsé par Groq AI (LLaMA 3.3 — GRATUIT)
   ====================== */

const $ = id => document.getElementById(id);

// ── UTILS ─────────────────────────────────────────────────────────────
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
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => (btn.textContent = orig), 1500);
  }
  showToast('📋 Copié !');
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── TABS ─────────────────────────────────────────────────────────────
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.hidden = true);
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  $(tabId).hidden = false;
  const idx = ['tab-videos','tab-charts','tab-ideas','tab-ai'].indexOf(tabId);
  document.querySelectorAll('.tab-btn')[idx]?.classList.add('active');
  if (tabId === 'tab-charts' && window._chartData) renderCharts(window._chartData);
}

// ── KEYS MANAGEMENT ─────────────────────────────────────────────────
function loadKeys() {
  const yt = localStorage.getItem('tubeai_yt_key') || '';
  const cl = localStorage.getItem('tubeai_groq_key') || '';
  $('ytKey').value = yt;
  $('claudeKey').value = cl;
  updateKeyStatus('yt', yt);
  updateKeyStatus('claude', cl);
}

function updateKeyStatus(type, value) {
  const dot = $(type + 'Dot');
  const status = $(type + 'Status');
  if (value) {
    dot.classList.add('saved');
    dot.classList.remove('missing');
    status.textContent = 'Sauvegardée ✓';
    status.style.color = '#4ade80';
  } else {
    dot.classList.remove('saved');
    dot.classList.add('missing');
    status.textContent = 'Non sauvegardée';
    status.style.color = 'var(--grey-400)';
  }
}

$('saveKeys').addEventListener('click', () => {
  const yt = $('ytKey').value.trim();
  const cl = $('claudeKey').value.trim();
  if (!yt || !cl) { showToast('⚠️ Remplis les deux clés !'); return; }
  localStorage.setItem('tubeai_yt_key', yt);
  localStorage.setItem('tubeai_groq_key', cl);
  updateKeyStatus('yt', yt);
  updateKeyStatus('claude', cl);
  showToast('✅ Clés sauvegardées !');
});

function getKeys() {
  return {
    yt: localStorage.getItem('tubeai_yt_key') || '',
    claude: localStorage.getItem('tubeai_groq_key') || ''
  };
}

// ── EXTRACT CHANNEL ──────────────────────────────────────────────────
function parseChannelUrl(url) {
  url = url.trim();
  const handleMatch = url.match(/youtube\.com\/@([^/?&]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelMatch) return { type: 'id', value: channelMatch[1] };
  const cMatch = url.match(/youtube\.com\/(?:c|user)\/([^/?&]+)/);
  if (cMatch) return { type: 'handle', value: cMatch[1] };
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
  const data = await ytFetch('search', { part: 'snippet', type: 'channel', q: parsed.value, maxResults: 1 }, key);
  if (data.items && data.items.length > 0) return data.items[0].snippet.channelId;
  throw new Error('Chaîne introuvable. Vérifie le lien.');
}

async function fetchChannelStats(channelId, key) {
  return ytFetch('channels', { part: 'snippet,statistics,brandingSettings', id: channelId }, key);
}

async function fetchRecentVideos(channelId, key, maxResults = 12) {
  const ch = await ytFetch('channels', { part: 'contentDetails', id: channelId }, key);
  const uploadsId = ch.items[0].contentDetails.relatedPlaylists.uploads;
  const pl = await ytFetch('playlistItems', { part: 'snippet,contentDetails', playlistId: uploadsId, maxResults }, key);
  const videoIds = pl.items.map(i => i.contentDetails.videoId).join(',');
  const details = await ytFetch('videos', { part: 'snippet,statistics,contentDetails', id: videoIds }, key);
  return details.items;
}

function isShort(video) {
  const dur = video.contentDetails.duration;
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return false;
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  return h === 0 && m < 2;
}

// ── RENDER ───────────────────────────────────────────────────────────
function renderChannelCard(ch) {
  const s = ch.snippet;
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

function renderStats(stats) {
  const avgViews = stats.videoCount > 0
    ? Math.round(parseInt(stats.viewCount) / parseInt(stats.videoCount)) : 0;
  const cards = [
    { icon: '👥', value: formatNumber(stats.subscriberCount), label: 'Abonnés' },
    { icon: '▶️', value: formatNumber(stats.viewCount), label: 'Vues totales' },
    { icon: '🎬', value: formatNumber(stats.videoCount), label: 'Vidéos publiées' },
    { icon: '📊', value: formatNumber(avgViews), label: 'Vues moy. / vidéo' },
  ];
  $('statsGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
}

function renderVideos(videos) {
  $('videosList').innerHTML = videos.map(v => {
    const s = v.snippet;
    const st = v.statistics;
    const short = isShort(v);
    const thumb = s.thumbnails?.medium?.url || '';
    return `
      <div class="video-item" onclick="window.open('https://youtube.com/watch?v=${v.id}','_blank')">
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

// ── CHARTS ───────────────────────────────────────────────────────────
let chartInstances = {};

function renderCharts(videos) {
  const labels = videos.map((v, i) => `V${i+1}`);
  const views = videos.map(v => parseInt(v.statistics.viewCount) || 0);
  const likes = videos.map(v => parseInt(v.statistics.likeCount) || 0);
  const comments = videos.map(v => parseInt(v.statistics.commentCount) || 0);
  const engagement = views.map((v, i) => v > 0 ? (((likes[i] + comments[i]) / v) * 100).toFixed(2) : 0);

  const chartConfig = (data, color, label) => ({
    type: 'bar',
    data: {
      labels,
      datasets: [{ label, data, backgroundColor: color + '99', borderColor: color, borderWidth: 2, borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#252525' } },
        y: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#252525' } }
      }
    }
  });

  const pairs = [
    ['chartViews', views, '#ff2d2d', 'Vues'],
    ['chartLikes', likes, '#a855f7', 'Likes'],
    ['chartComments', comments, '#e8ff47', 'Commentaires'],
    ['chartEngagement', engagement, '#4ade80', 'Engagement %']
  ];

  pairs.forEach(([id, data, color, label]) => {
    if (chartInstances[id]) chartInstances[id].destroy();
    const ctx = $(id).getContext('2d');
    chartInstances[id] = new Chart(ctx, chartConfig(data, color, label));
  });
}

// ── GROQ API (GRATUIT) ────────────────────────────────────────────────
// Clé gratuite sur https://console.groq.com
// Modèle : llama-3.3-70b-versatile — rapide et très capable
async function callGroq(prompt, groqKey) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || '';
}

// ── RENDER AI ADVICE ─────────────────────────────────────────────────
function renderMarkdown(markdown, targetId) {
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
  $(targetId).innerHTML = html;
}

// ── ANALYZE ──────────────────────────────────────────────────────────
$('analyzeBtn').addEventListener('click', analyzeChannel);
$('channelUrl').addEventListener('keydown', e => { if (e.key === 'Enter') analyzeChannel(); });

async function analyzeChannel() {
  const { yt, claude } = getKeys();
  if (!yt) { showToast('❗ Ajoute ta clé YouTube dans Config'); return; }
  if (!claude) { showToast('❗ Ajoute ta clé Groq dans Config'); return; }

  const url = $('channelUrl').value.trim();
  if (!url) { showToast('⚠️ Colle un lien YouTube !'); return; }

  const parsed = parseChannelUrl(url);
  if (!parsed) { showToast('❌ Lien invalide. Ex: youtube.com/@MaChaîne'); return; }

  $('results').hidden = true;
  setLoading(true, 'Résolution de la chaîne...');

  try {
    const channelId = await resolveChannelId(parsed, yt);
    setLoading(true, 'Chargement des statistiques...');
    const [chData, videos] = await Promise.all([
      fetchChannelStats(channelId, yt),
      fetchRecentVideos(channelId, yt, 12)
    ]);

    if (!chData.items || chData.items.length === 0) throw new Error('Chaîne introuvable.');
    const ch = chData.items[0];
    setLoading(false);

    $('results').hidden = false;
    renderChannelCard(ch);
    renderStats(ch.statistics);
    renderVideos(videos);

    window._chartData = videos;
    showTab('tab-videos');

    setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    // Lance les analyses IA en parallèle
    setLoading(true, 'Groq AI analyse ta chaîne...');
    await Promise.all([
      generateAiAdvice(ch, videos, claude),
      generateVideoIdeas(ch, videos, claude)
    ]);
    setLoading(false);

  } catch (err) {
    setLoading(false);
    showToast('❌ ' + err.message, 4000);
    console.error(err);
  }
}

async function generateAiAdvice(ch, videos, claudeKey) {
  const stats = ch.statistics;
  const avgViews = stats.videoCount > 0
    ? Math.round(parseInt(stats.viewCount) / parseInt(stats.videoCount)) : 0;

  const videoSummary = videos.slice(0, 6).map(v => ({
    titre: v.snippet.title,
    vues: v.statistics.viewCount,
    likes: v.statistics.likeCount,
    commentaires: v.statistics.commentCount,
    short: isShort(v)
  }));

  const prompt = `Tu es un expert en croissance de chaînes YouTube. Analyse cette chaîne et donne des conseils détaillés et actionnables.

DONNÉES :
- Nom : ${ch.snippet.title}
- Description : ${ch.snippet.description?.slice(0, 300) || 'N/A'}
- Abonnés : ${stats.subscriberCount}
- Vues totales : ${stats.viewCount}
- Vidéos : ${stats.videoCount}
- Vues moy/vidéo : ${avgViews}
- Pays : ${ch.snippet.country || 'N/A'}
- Créée le : ${ch.snippet.publishedAt}

DERNIÈRES VIDÉOS :
${JSON.stringify(videoSummary, null, 2)}

Fournis une analyse en français avec :
1. **Résumé de la chaîne** (forces, positionnement)
2. **Points forts** (ce qui fonctionne)
3. **Axes d'amélioration** (3-5 conseils précis)
4. **Stratégie de contenu** (fréquence, formats, sujets)
5. **Taux d'engagement** et signification
6. **Priorité n°1** : action la plus importante maintenant

Sois direct, percutant, basé sur les vraies données.`;

  try {
    const advice = await callGroq(prompt, claudeKey);
    renderMarkdown(advice, 'aiContent');
  } catch (err) {
    $('aiContent').innerHTML = `<p style="color:#ff6b6b">Erreur Groq : ${err.message}</p>`;
  }
}

async function generateVideoIdeas(ch, videos, claudeKey) {
  const recentTitles = videos.slice(0, 8).map(v => v.snippet.title);
  const topVideo = [...videos].sort((a,b) => parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount))[0];

  const prompt = `Tu es un stratège de contenu YouTube expert. Génère des idées de vidéos percutantes pour cette chaîne.

CHAÎNE : ${ch.snippet.title}
ABONNÉS : ${ch.statistics.subscriberCount}
DESCRIPTION : ${ch.snippet.description?.slice(0, 200) || 'N/A'}
VIDÉO LA PLUS VUE : "${topVideo?.snippet.title || 'N/A'}" (${topVideo?.statistics.viewCount || 0} vues)
DERNIÈRES VIDÉOS :
${recentTitles.map(t => '- ' + t).join('\n')}

Génère exactement 8 idées de vidéos. Pour chaque idée, réponds STRICTEMENT en JSON avec ce format (un objet par ligne, sans markdown) :
{"type":"Long","titre":"Titre accrocheur ici","pourquoi":"Raison courte pourquoi ça va marcher (1 phrase)"}

Types possibles : "Long", "Short", "Série", "Tuto", "Challenge", "Réaction"
Génère des idées variées, originales et adaptées à la niche de la chaîne.
Réponds UNIQUEMENT avec les 8 lignes JSON, rien d'autre.`;

  try {
    const result = await callGroq(prompt, claudeKey);
    renderVideoIdeas(result);
  } catch (err) {
    $('ideasContent').innerHTML = `<p style="color:#ff6b6b">Erreur Groq : ${err.message}</p>`;
  }
}

function renderVideoIdeas(text) {
  const lines = text.trim().split('\n').filter(l => l.trim().startsWith('{'));
  const ideas = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  if (!ideas.length) {
    $('ideasContent').innerHTML = `<p style="color:#888">Impossible de parser les idées. Réessaie.</p>`;
    return;
  }

  const typeColors = {
    'Long': '#ff2d2d', 'Short': '#a855f7', 'Série': '#e8ff47',
    'Tuto': '#4ade80', 'Challenge': '#fb923c', 'Réaction': '#38bdf8'
  };

  $('ideasContent').innerHTML = `
    <div class="ideas-grid">
      ${ideas.map(idea => `
        <div class="idea-card">
          <div class="idea-type" style="color:${typeColors[idea.type] || '#e8ff47'}">${idea.type}</div>
          <div class="idea-title">${idea.titre}</div>
          <div class="idea-why">${idea.pourquoi}</div>
          <button class="idea-copy" onclick="copyText('${idea.titre.replace(/'/g,"\\'")}', this)">📋 Copier le titre</button>
        </div>
      `).join('')}
    </div>
  `;
}

// ── VIDEO TITLE TOOL ─────────────────────────────────────────────────
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
  if (!claude) { showToast('❗ Ajoute ta clé Groq dans Config'); return; }

  const desc = $('videoDesc').value.trim();
  if (!desc) { showToast('⚠️ Décris ta vidéo !'); return; }

  const niche = $('channelNiche').value.trim();
  const lang = $('outputLang').value;
  const isShortContent = contentType === 'short';

  $('generateBtn').disabled = true;
  $('generateBtn').textContent = 'Groq génère... ✨';
  $('genOutput').hidden = true;

  const prompt = `Tu es un expert en optimisation YouTube et copywriting viral.

TYPE : ${isShortContent ? 'YouTube SHORT (vertical, max 60s)' : 'Vidéo YouTube longue'}
NICHE : ${niche || 'Non précisé'}
SUJET : ${desc}
LANGUE : ${lang}

Génère :
1. EXACTEMENT 3 titres optimisés pour le CTR.
   - Vidéo longue : 40-70 caractères, accrocheurs
   - Short : 30-50 caractères, percutant
   - Format : "TITRE: [titre ici]" (un par ligne)

${isShortContent ? `2. EXACTEMENT 15 hashtags pour les Shorts.
   - Format : "TAG: #hashtag" (un par ligne)

` : ''}3. Explication en 2-3 phrases pourquoi ces titres fonctionnent.
   Format : "EXPLICATION: [texte]"

Réponds UNIQUEMENT avec ce format, rien d'autre.`;

  try {
    const result = await callGroq(prompt, claude);
    parseAndRenderGenOutput(result, isShortContent);
  } catch (err) {
    showToast('❌ Erreur Groq : ' + err.message, 4000);
  } finally {
    $('generateBtn').disabled = false;
    $('generateBtn').textContent = 'Générer avec Groq AI ✨';
  }
}

function parseAndRenderGenOutput(text, isShortContent) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const titles = lines.filter(l => l.startsWith('TITRE:')).map(l => l.replace('TITRE:', '').trim());
  const tags = lines.filter(l => l.startsWith('TAG:')).map(l => l.replace('TAG:', '').trim());
  const explication = lines.filter(l => l.startsWith('EXPLICATION:')).map(l => l.replace('EXPLICATION:', '').trim()).join(' ');

  $('genTitles').innerHTML = titles.length
    ? titles.map(t => `
        <div class="gen-title-item">
          <span>${t}</span>
          <button class="copy-btn" onclick="copyText('${t.replace(/'/g,"\\'")}', this)">📋 Copier</button>
        </div>
      `).join('')
    : '<p style="color:#888">Aucun titre généré. Réessaie.</p>';

  const hashSection = $('hashtagSection');
  if (isShortContent && tags.length > 0) {
    hashSection.hidden = false;
    $('genHashtags').innerHTML = tags.map(h => `
      <span class="hashtag-pill" onclick="copyText('${h}', this)">${h}</span>
    `).join('');
  } else {
    hashSection.hidden = true;
  }

  $('genExplanation').textContent = explication || 'Aucune explication fournie.';
  $('genOutput').hidden = false;
  $('genOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── INIT ─────────────────────────────────────────────────────────────
loadKeys();
console.log('%cTubeAI v2 🎬', 'font-size:24px; color:#ff2d2d; font-weight:bold');
console.log('Propulsé par Groq AI (LLaMA 3.3 — GRATUIT) — https://console.groq.com');
