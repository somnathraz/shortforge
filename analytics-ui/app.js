function formatCount(n) {
  const value = Number(n || 0);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setStatus(text, kind = '') {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = `status${kind ? ` ${kind}` : ''}`;
}

let currentPlatform = 'all';

function renderFactoryTable(rows) {
  const root = document.getElementById('factory-list');
  if (!rows.length) {
    root.innerHTML = '<p class="muted">Nothing published for this filter.</p>';
    return;
  }
  const maxViews = Math.max(...rows.map((row) => Number(row.viewCount || 0)), 1);
  const body = rows
    .map((row) => {
      const title = row.titleUsed || row.videoId || '(untitled)';
      const url = row.url || '#';
      const views = Number(row.viewCount || 0);
      const likes = Number(row.likeCount || 0);
      const comments = Number(row.commentCount || 0);
      const width = Math.max(4, Math.round((views / maxViews) * 100));
      const error = row.error
        ? `<div class="error-note">${escapeHtml(row.error)}</div>`
        : '';
      return `<tr>
        <td><span class="pill pill-${escapeHtml(row.platform)}">${escapeHtml(row.platform)}</span></td>
        <td>
          <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>
          <div class="mono muted" style="margin-top:0.2rem">${escapeHtml(row.episodeId)}${
            row.kind ? ` · ${escapeHtml(row.kind)}` : ''
          }</div>
          ${error}
        </td>
        <td>
          ${row.viewCount != null ? formatCount(views) : '—'}
          ${row.viewCount != null ? `<div class="bar"><span style="width:${width}%"></span></div>` : ''}
        </td>
        <td>${row.likeCount != null ? formatCount(likes) : '—'}</td>
        <td>${row.commentCount != null ? formatCount(comments) : '—'}</td>
        <td class="mono muted">${escapeHtml(row.videoId || '—')}</td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `<table>
    <thead>
      <tr>
        <th>Platform</th>
        <th>Title</th>
        <th>Views</th>
        <th>Likes</th>
        <th>Comments</th>
        <th>ID</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderRecentYoutube(rows) {
  const root = document.getElementById('recent-list');
  if (!rows.length) {
    root.innerHTML = '<p class="muted">No recent YouTube uploads.</p>';
    return;
  }
  const maxViews = Math.max(...rows.map((row) => Number(row.viewCount || 0)), 1);
  const body = rows
    .map((row) => {
      const width = Math.max(4, Math.round((Number(row.viewCount || 0) / maxViews) * 100));
      return `<tr>
        <td><a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.title)}</a></td>
        <td>${formatCount(row.viewCount)}<div class="bar"><span style="width:${width}%"></span></div></td>
        <td>${formatCount(row.likeCount)}</td>
        <td>${formatCount(row.commentCount)}</td>
        <td class="mono muted">${escapeHtml(row.id)}</td>
      </tr>`;
    })
    .join('');
  root.innerHTML = `<table>
    <thead><tr><th>Title</th><th>Views</th><th>Likes</th><th>Comments</th><th>ID</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderAccounts(data) {
  const root = document.getElementById('accounts');
  const bits = [];
  if (data.youtube?.channel) {
    const c = data.youtube.channel;
    bits.push(
      `<div class="account"><strong>YouTube</strong><div>${escapeHtml(c.title)}</div><div class="muted">${formatCount(c.subscriberCount)} subs · ${formatCount(c.viewCount)} views</div></div>`
    );
  }
  if (data.instagram?.account) {
    const a = data.instagram.account;
    bits.push(
      `<div class="account"><strong>Instagram</strong><div>@${escapeHtml(a.username || a.name)}</div><div class="muted">${formatCount(a.followersCount)} followers${a.mediaCount != null ? ` · ${formatCount(a.mediaCount)} media` : ''}</div></div>`
    );
  }
  if (data.facebook?.page) {
    const p = data.facebook.page;
    bits.push(
      `<div class="account"><strong>Facebook</strong><div>${escapeHtml(p.name)}</div><div class="muted">${formatCount(p.followersCount)} followers</div></div>`
    );
  }
  document.getElementById('accounts-panel').hidden = bits.length === 0;
  root.innerHTML = bits.join('') || '';
}

async function loadDashboard() {
  const button = document.getElementById('refresh');
  button.disabled = true;
  setStatus(`Fetching ${currentPlatform} analytics…`);

  try {
    const response = await fetch(`/api/analytics/overview?platform=${encodeURIComponent(currentPlatform)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

    document.getElementById('kpis').hidden = false;
    document.getElementById('kpi-publishes').textContent = formatCount(data.totals.publishCount);
    document.getElementById('kpi-views').textContent = formatCount(data.totals.viewCount);
    document.getElementById('kpi-likes').textContent = formatCount(data.totals.likeCount);
    document.getElementById('kpi-comments').textContent = formatCount(data.totals.commentCount);

    const followersCard = document.getElementById('kpi-followers-card');
    const ytSubsCard = document.getElementById('kpi-yt-subs-card');
    followersCard.hidden = true;
    ytSubsCard.hidden = true;

    if (currentPlatform === 'instagram' && data.instagram?.account) {
      followersCard.hidden = false;
      document.getElementById('kpi-followers-label').textContent = 'IG followers';
      document.getElementById('kpi-followers').textContent = formatCount(
        data.instagram.account.followersCount
      );
    } else if (currentPlatform === 'facebook' && data.facebook?.page) {
      followersCard.hidden = false;
      document.getElementById('kpi-followers-label').textContent = 'FB followers';
      document.getElementById('kpi-followers').textContent = formatCount(
        data.facebook.page.followersCount
      );
    } else if (currentPlatform === 'youtube' && data.youtube?.channel) {
      ytSubsCard.hidden = false;
      document.getElementById('kpi-yt-subs').textContent = formatCount(
        data.youtube.channel.subscriberCount
      );
    } else if (currentPlatform === 'all') {
      if (data.youtube?.channel) {
        ytSubsCard.hidden = false;
        document.getElementById('kpi-yt-subs').textContent = formatCount(
          data.youtube.channel.subscriberCount
        );
      }
    }

    document.getElementById('fetched-at').textContent = `Updated ${new Date(
      data.fetchedAt
    ).toLocaleString()}`;
    renderAccounts(data);
    renderFactoryTable(data.factoryPublishes || []);

    const showRecent = currentPlatform === 'all' || currentPlatform === 'youtube';
    document.getElementById('recent-panel').hidden = !showRecent;
    if (showRecent) renderRecentYoutube(data.youtube?.recentVideos || []);

    setStatus(`Showing ${currentPlatform} · ${data.totals.publishCount} publish row(s).`, 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
    currentPlatform = button.getAttribute('data-platform') || 'all';
    void loadDashboard();
  });
});

document.getElementById('refresh').addEventListener('click', () => {
  void loadDashboard();
});

void loadDashboard();
