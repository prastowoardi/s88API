// ─── State ───────────────────────────────────────────────────────────────────
const S = {
    envKey: null, currency: null, merchant: null,
    envInfo: null, loadedConfig: null,
    depositTab: 's88-v2', payoutTab: 's88-v2', batchTab: 'dep', encTab: 'enc'
};

// ─── Init ────────────────────────────────────────────────────────────────────
(async () => {
    await loadEnvGrid();
    initWS();
})();

async function loadEnvGrid() {
    const res = await apiFetch('/api/envs');
    if (!res) return;
    const grid = document.getElementById('env-grid');
    grid.innerHTML = '';
    Object.entries(res).forEach(([key, cfg]) => {
        const d = document.createElement('div');
        d.className = 'env-card' + (S.envKey === key ? ' selected' : '');
        d.id = 'ecard-' + key;
        d.innerHTML = `<div><div class="env-name">${cfg.label}</div><div class="env-file">${cfg.file}</div></div>
<span class="badge ${cfg.type === 'production' ? 'badge-prod' : 'badge-stag'}">${cfg.type}</span>`;
        d.onclick = () => selectEnv(key, cfg);
        grid.appendChild(d);
    });
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function go(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    document.getElementById('nav-' + id).classList.add('active');
    const titles = {
        env: 'Environment', deposit: 'Deposit', payout: 'Payout', batch: 'Batch',
        callback: 'Manual Callback', checkwd: 'Check WD Status', encrypt: 'Encrypt / Decrypt',
        config: 'Config aktif', logs: 'Activity Log'
    };
    document.getElementById('page-title').textContent = titles[id] || id;
    if (id === 'config') renderConfig();
}

// ─── Env selection ───────────────────────────────────────────────────────────
function selectEnv(key, cfg) {
    S.envKey = key; S.envInfo = cfg;
    document.querySelectorAll('.env-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('ecard-' + key)?.classList.add('selected');
    const p = document.getElementById('env-pill');
    p.textContent = cfg.label;
    p.className = 'env-pill' + (cfg.type === 'production' ? ' prod' : '');
}

async function onCurrencyChange() {
    const curr = $('#e-currency').val();
    S.currency = curr;
    
    const $mSelect = $('#e-merchant');
    $mSelect.html('<option value="">-- loading --</option>').trigger('change');

    if (!curr || !S.envKey) {
        $mSelect.html('<option value="">-- pilih merchant --</option>').trigger('change');
        return;
    }

    const res = await apiFetch('/api/merchants', { envKey: S.envKey, currency: curr });
    if (!res) return;

    let options = '<option value="">-- pilih merchant --</option>';
    res.merchants.forEach(m => {
        options += `<option value="${m}">${m}</option>`;
    });

    $mSelect.html(options).trigger('change');

    if (res.merchants.length === 1) {
        $mSelect.val(res.merchants[0]).trigger('change');
        S.merchant = res.merchants[0];
    }
}

async function loadEnvConfig() {
    if (!S.envKey) { showEnvOut('<span class="err">✗ Pilih environment terlebih dahulu.</span>'); return; }
    const curr = document.getElementById('e-currency').value;
    const merch = document.getElementById('e-merchant').value;
    S.currency = curr; S.merchant = merch;

    const res = await apiFetch('/api/env-vars', { envKey: S.envKey, currency: curr, merchant: merch });
    if (!res) return;
    S.loadedConfig = res.config;

    // Apply overrides
    if (document.getElementById('e-baseurl').value) S.loadedConfig.baseUrl = document.getElementById('e-baseurl').value;
    if (document.getElementById('e-depmethod').value) S.loadedConfig.depMethod = document.getElementById('e-depmethod').value;
    if (document.getElementById('e-paymethod').value) S.loadedConfig.payMethod = document.getElementById('e-paymethod').value;

    if (curr) { const cp = document.getElementById('curr-pill'); cp.textContent = curr; cp.classList.remove('hidden'); }
    document.getElementById('merchant-pill').textContent = merch ? `  ${merch}` : '';

    const c = S.loadedConfig;
    showEnvOut(`<span class="ok">✓ Konfigurasi berhasil dimuat.</span>

<span class="dim">env        </span>  ${S.envInfo?.label || S.envKey}
<span class="dim">currency   </span>  ${curr || '—'}
<span class="dim">merchant   </span>  ${merch || '—'}
<span class="dim">base url   </span>  ${c.baseUrl || '(kosong)'}
<span class="dim">merch code </span>  ${c.merchantCode || '(kosong)'}
<span class="dim">api key    </span>  ${c.merchantAPI ? '••••' + c.merchantAPI.slice(-4) : '(kosong)'}
<span class="dim">secret key </span>  ${c.secretKey ? '••••' + c.secretKey.slice(-4) : '(kosong)'}
<span class="dim">dep method </span>  ${c.depMethod || '(kosong)'}
<span class="dim">pay method </span>  ${c.payMethod || '(kosong)'}`);
}

function showEnvOut(html) {
    const p = document.getElementById('env-out'); p.style.display = 'block';
    document.getElementById('env-out-body').innerHTML = html;
}

// ─── Deposit ─────────────────────────────────────────────────────────────────
let dTab = 'v2';
function dtab(t) {
    S.depositTab = t;
    document.querySelectorAll('#page-deposit .tab').forEach(tb => tb.classList.remove('active'));
    document.getElementById('dtab-' + t)?.classList.add('active');
    if (S.currency === 'THB') {
        document.getElementById('d-depbank-wrap').classList.remove('hidden');
    }
}

async function runDeposit() {
    if (!assertConfig()) return;
    const currency = $('#e-currency').val();
    const merchant = $('#e-merchant').val();
    const amount = document.getElementById('d-amount').value;
    if (!currency || !merchant || !amount) {
        flash("Currency, Merchant, dan Amount wajib diisi!");
        return;
    }
    const body = {
        envKey: S.envKey, currency, merchant,
        version: S.depositTab, amount,
        bankCode: document.getElementById('d-bankcode').value,
        depositorBank: document.getElementById('d-depbank')?.value || '',
        transactionCode: document.getElementById('d-txcode').value,
        redirectUrl: document.getElementById('d-redirect').value,
        callbackUrl: document.getElementById('d-callback').value,
    };
    const out = document.getElementById('dep-body');
    const spin = document.getElementById('dep-spin');
    out.innerHTML = `<span class="dim">// Mengirim request Deposit ${S.depositTab}...</span>`;
    spin.classList.remove('hidden');
    let endpoint = '/api/deposit/prepare';
    if (S.depositTab === 's88-v5' || S.depositTab === 'paybo-v5') endpoint = '/api/deposit/prepare-v5';
    const res = await apiFetch(endpoint, body);
    spin.classList.add('hidden');
    if (res) {
        out.innerHTML = formatResponse(res, 'Deposit ' + S.depositTab.toUpperCase());
        logAction('DEPOSIT', `${S.depositTab} - ${body.currency} ${body.amount}`);
    }
}

function buildFetchSnippetV5(res) {
    return `<span class="dim">--- Fetch snippet ---</span>\nfetch("${res.depositUrl}", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "sign": "${res.signature}"\n  },\n  body: JSON.stringify(${JSON.stringify(res.payload)})\n});`;
}

// ─── Payout ──────────────────────────────────────────────────────────────────
let pTab = 's88-v2';

function ptab(t) {
    S.payoutTab = t;
    document.querySelectorAll('#page-payout .tab').forEach(tb => tb.classList.remove('active'));
    document.getElementById('ptab-' + t)?.classList.add('active');
}

async function runPayout() {
    if (!assertConfig()) return;
    const body = {
        envKey: S.envKey,
        currency: $('#e-currency').val(),
        merchant: $('#e-merchant').val(),
        version: S.payoutTab,
        amount: document.getElementById('p-amount').value,
        bankCode: document.getElementById('p-bankcode').value,
        accountName: document.getElementById('p-accname').value || 'Test User',
        transactionCode: document.getElementById('p-txcode').value,
        callbackUrl: document.getElementById('p-callback').value,
    };
    const out = document.getElementById('pay-body');
    const spin = document.getElementById('pay-spin');
    out.innerHTML = `<span class="dim">// Mengirim request ${S.payoutTab}...</span>`;
    spin.classList.remove('hidden');
    let endpoint = '/api/payout/prepare';
    if (S.payoutTab.includes('v5')) endpoint = '/api/payout/prepare-v5';
    try {
        const res = await apiFetch(endpoint, body);
        spin.classList.add('hidden');
        if (!res) return;
        out.innerHTML = formatResponse(res, 'Payout ' + S.payoutTab.toUpperCase());
        logAction('PAYOUT', `${S.payoutTab} - ${body.currency} ${body.amount}`);
    } catch (e) {
        spin.classList.add('hidden');
        out.innerHTML = renderErrorCard(e.message, 'Payout Error');
    }
}

// ─── Batch ───────────────────────────────────────────────────────────────────
let bTab = 'dep';
function btab(t) {
    bTab = t;
    document.querySelectorAll('[id^="btab-"]').forEach(b => b.classList.toggle('active', b.id === 'btab-' + t));
}

function autoFillBatch() {
    const count = parseInt(document.getElementById('b-count').value) || 3;
    const entries = Array.from({ length: count }, (_, i) => ({
        amount: (i + 1) * 5000,
        bank_code: ['HDFC', 'ICICI', 'SBI', 'AXIS', 'PNB'][i % 5],
    }));
    document.getElementById('b-json').value = JSON.stringify(entries, null, 2);
}

async function runBatch() {
    if (!assertConfig()) return;
    let entries;
    try { entries = JSON.parse(document.getElementById('b-json').value || '[]'); }
    catch (e) { setOut('batch-body', renderErrorCard(`JSON tidak valid: ${e.message}`, 'Parse Error')); return; }
    if (!entries.length) { autoFillBatch(); try { entries = JSON.parse(document.getElementById('b-json').value); } catch (_) { } }
    spin('batch-spin', true);
    const version = document.getElementById('b-version').value;
    const endpoint = S.batchTab === 'dep' ? '/api/batch/deposit' : '/api/batch/payout';
    const res = await apiFetch(endpoint, { envKey: S.envKey, currency: S.currency, merchant: S.merchant, entries, version });
    spin('batch-spin', false);
    if (!res) return;

    let entriesHtml = '';
    res.results.forEach((r, i) => {
        const fields = [
            ['TX Code', r.txCode, 'code'],
            ['Name', r.name],
        ];
        if (r.paymentUrl) fields.push(['URL', r.paymentUrl, 'url']);
        if (r.encrypted) fields.push(['Encrypted', r.encrypted.substring(0, 60) + '…']);
        if (r.signature) fields.push(['Signature', r.signature.substring(0, 60) + '…']);

        entriesHtml += `<div class="resp-card">
            <div class="resp-header">
                <span class="resp-status info">#${i + 1}</span>
                <span class="resp-title">Entry ${i + 1}</span>
            </div>
            <div class="resp-body">
                <div class="resp-kv">`;
        fields.forEach(([k, v, cls]) => {
            entriesHtml += `<span class="resp-kv-key">${escapeHtml(k)}</span>
                        <span class="resp-kv-val ${cls || ''}">${escapeHtml(v)}</span>`;
        });
        entriesHtml += `</div></div></div>`;
    });

    const html = renderSuccessCard(`${res.count} Batch Entries Generated`, null) +
        entriesHtml +
        `<div class="resp-card"><div class="resp-header">
            <span class="resp-status info">JSON</span>
            <span class="resp-title">Full Response</span>
        </div><div class="resp-body"><div class="resp-json">${syntaxHighlight(JSON.stringify(res.results, null, 2))}</div></div></div>`;

    setOut('batch-body', html);
}

// ─── Callback ────────────────────────────────────────────────────────────────
async function runCallback() {
    const url = v('cb-url');
    if (!url) { setOut('cb-body', renderErrorCard('Callback URL wajib diisi.', 'Validation Error')); return; }
    const tx = v('cb-tx'), status = v('cb-status'), amount = v('cb-amount'), currency = v('cb-currency');
    let extra = {};
    try { const ev = v('cb-extra'); if (ev) extra = JSON.parse(ev); } catch (e) { setOut('cb-body', renderErrorCard(`Extra JSON tidak valid: ${e.message}`, 'Parse Error')); return; }
    const payload = { transaction_code: tx, status, ...(amount && { amount: Number(amount) }), ...(currency && { currency_code: currency }), ...extra };
    spin('cb-spin', true);
    let responseHtml = '';
    try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), mode: 'no-cors' });
        responseHtml = renderSuccessCard('Request Terkirim', 'no-cors mode — respons tidak bisa dibaca dari browser.');
    } catch (e) {
        responseHtml = renderWarningCard('Fetch Error (CORS/network)', e.message) +
            `\n\n<div class="resp-section"><div class="resp-section-title">cURL Alternative</div>
            <div class="curl-block"><span class="curl-cmd">curl</span> <span class="curl-flag">-X</span> POST <span class="curl-val">"${url}"</span> <span class="curl-flag">\\\\</span>\n  <span class="curl-flag">-H</span> <span class="curl-val">"Content-Type: application/json"</span> <span class="curl-flag">\\\\</span>\n  <span class="curl-flag">-d</span> <span class="curl-val">'${escapeHtml(JSON.stringify(payload))}'</span></div></div>`;
    }
    spin('cb-spin', false);
    const html = renderInfoCard('Callback Payload', null, [
        ['URL', url, 'url'], ['Method', 'POST'], ['Status', status, 'code'],
        ['TX Code', tx], ['Amount', amount || '-'], ['Currency', currency || '-']
    ]) + `<div class="resp-section">
        <div class="resp-section-title">Payload JSON</div>
        <div class="resp-json">${syntaxHighlight(JSON.stringify(payload, null, 2))}</div>
    </div>` + responseHtml;
    setOut('cb-body', html);
}

// ─── Check WD ────────────────────────────────────────────────────────────────
async function runCheckWD() {
    if (!assertConfig()) return;
    const reqNo = v('wd-reqno');
    if (!reqNo) { setOut('wd-body', renderErrorCard('Request No wajib diisi.', 'Validation Error')); return; }
    const res = await apiFetch('/api/check-wd-status', { envKey: S.envKey, currency: S.currency, merchant: S.merchant, requestNo: reqNo });
    if (!res) return;
    const html = renderSuccessCard('Check WD Status', 'Signed request berhasil di-generate') +
        renderInfoCard('Request Details', null, [
            ['URL', res.url, 'url'], ['Request No', reqNo, 'code']
        ]) + `<div class="resp-section">
            <div class="resp-section-title info">Headers</div>
            <div class="resp-json">Content-Type: application/json\nsign: ${escapeHtml(res.signature)}</div>
        </div><div class="resp-section">
            <div class="resp-section-title">Payload</div>
            <div class="resp-json">${syntaxHighlight(JSON.stringify(res.payload, null, 2))}</div>
        </div>`;
    setOut('wd-body', html);
}

// ─── Encrypt/Decrypt ─────────────────────────────────────────────────────────
let eTab = 'enc';
function etab(t) {
    eTab = t;
    document.querySelectorAll('[id^="etab-"]').forEach(b => b.classList.toggle('active', b.id === 'etab-' + t));
}

async function runEncrypt() {
    const input = v('enc-input');
    if (!input) { setOut('enc-body', renderErrorCard('Input kosong.', 'Validation Error')); return; }
    const apiKey = v('enc-api') || S.loadedConfig?.merchantAPI;
    const secKey = v('enc-sec') || S.loadedConfig?.secretKey;
    if (!apiKey || !secKey) { setOut('enc-body', renderErrorCard('API key / Secret key tidak tersedia. Isi di field override atau load konfigurasi terlebih dahulu.', 'Missing Keys')); return; }
    if (S.encTab === 'sign') {
        const res = await apiFetch('/api/sign', { data: input, secretKey: secKey });
        if (!res) return;
        setOut('enc-body', renderSuccessCard('HMAC-SHA256 Signature', null) +
            `<div class="resp-section"><div class="resp-section-title">Signature</div>
            <div class="resp-json" style="word-break:break-all">${escapeHtml(res.signature)}</div>
            <div class="resp-copy-hint">Klik "Copy output" untuk menyalin</div></div>`);
        return;
    }
    const action = S.encTab === 'dec' ? 'decrypt' : 'encrypt';
    const data = S.encTab === 'epayout' ? (() => { try { return JSON.parse(input); } catch { return input; } })() : input;
    const res = await apiFetch('/api/encrypt', { action, data, apiKey, secretKey: secKey });
    if (!res) return;
    const result = typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : res.result;
    setOut('enc-body', renderSuccessCard(`${action.charAt(0).toUpperCase() + action.slice(1)} Selesai`, null) +
        `<div class="resp-section"><div class="resp-section-title">Result</div>
        <div class="resp-json" style="word-break:break-all">${escapeHtml(result)}</div>
        <div class="resp-copy-hint">Klik "Copy output" untuk menyalin</div></div>`);
}

// ─── Config page ──────────────────────────────────────────────────────────────
function renderConfig() {
    const el = document.getElementById('cfg-table');
    const c = S.loadedConfig;
    if (!c && !S.envKey) { el.innerHTML = 'Belum ada konfigurasi. Pilih environment di halaman Setup.'; return; }
    el.innerHTML = `
<span class="kk">environment </span><span class="kv">${S.envInfo?.label || S.envKey || '—'}</span>
<span class="kk">env file    </span><span class="kv">${S.envInfo?.file || '—'}</span>
<span class="kk">type        </span><span class="kv">${S.envInfo?.type || '—'}</span>
<span class="kk">currency    </span><span class="kv">${S.currency || '—'}</span>
<span class="kk">merchant    </span><span class="kv">${S.merchant || '—'}</span>
<span class="kk">base url    </span><span class="kv">${c?.baseUrl || '—'}</span>
<span class="kk">merch code  </span><span class="kv">${c?.merchantCode || '—'}</span>
<span class="kk">api key     </span><span class="kv">${c?.merchantAPI ? '••••' + c.merchantAPI.slice(-4) : '—'}</span>
<span class="kk">secret key  </span><span class="kv">${c?.secretKey ? '••••' + c.secretKey.slice(-4) : '—'}</span>
<span class="kk">dep method  </span><span class="kv">${c?.depMethod || '—'}</span>
<span class="kk">pay method  </span><span class="kv">${c?.payMethod || '—'}</span>`;
}

function exportCfg() {
    const safe = {
        env: S.envKey,
        currency: S.currency,
        merchant: S.merchant,
        baseUrl: S.loadedConfig?.baseUrl,
        depMethod: S.loadedConfig?.depMethod,
        payMethod: S.loadedConfig?.payMethod,
        merchantCode: S.loadedConfig?.merchantCode,
        apiKey: '[REDACTED]',
        secretKey: '[REDACTED]'
    };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 's88-config.json';
    a.click();
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
let ws;
function initWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);
    ws.onopen = () => { document.getElementById('ws-dot').classList.add('on'); };
    ws.onclose = () => { document.getElementById('ws-dot').classList.remove('on'); setTimeout(initWS, 3000); };
    ws.onmessage = (e) => {
        try {
            const d = JSON.parse(e.data);
            if (d.type === 'log') addLog(d);
            if (d.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch (_) { }
    };
}

function addLog(d) {
    const el = document.getElementById('log-list');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const t = new Date(d.ts).toLocaleTimeString();
    entry.innerHTML = `<span class="log-ts">${t}</span><span class="log-action">${d.action}</span><span style="color:var(--text3)">${d.env || ''}</span> ${d.currency || ''} ${d.merchant || ''} ${d.amount ? '→ ' + d.amount : ''} ${d.count ? `(${d.count} entries)` : ''}`;
    if (el.firstChild?.textContent?.includes('Menunggu')) el.innerHTML = '';
    el.insertBefore(entry, el.firstChild);
    if (el.children.length > 200) el.removeChild(el.lastChild);
}

function clearLogs() { document.getElementById('log-list').innerHTML = '<span style="color:var(--text3)">Log dibersihkan.</span>'; }

// ─── Utils ────────────────────────────────────────────────────────────────────
function v(id) { return document.getElementById(id)?.value?.trim() || ''; }
function setOut(id, html) { document.getElementById(id).innerHTML = html; }
function spin(id, on) { document.getElementById(id).classList.toggle('hidden', !on); }

function assertConfig() {
    if (!S.envKey) {
        flash('Pilih environment terlebih dahulu!'); return false;
    }
    if (!S.currency) {
        flash('Pilih currency terlebih dahulu!'); return false;
    }
    if (!S.loadedConfig) {
        flash('Klik "Load konfigurasi" di halaman Environment!'); return false;
    }
    return true;
}

function genTx(id, prefix) {
    const ts = Math.floor(Date.now() / 1000);
    const rand = Math.floor(Math.random() * 9000 + 1000);
    document.getElementById(id).value = `${prefix}-${ts}-${rand}`;
}

function copyOutput(id) {
    const text = document.getElementById(id).innerText;
    navigator.clipboard.writeText(text).then(() => flash('Disalin!')).catch(() => { });
}

function flash(msg) {
    const el = document.getElementById('copy-flash');
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}

function clearSession() {
    S.envKey = null; S.currency = null; S.merchant = null; S.envInfo = null; S.loadedConfig = null;
    document.getElementById('env-pill').textContent = '— belum dipilih'; document.getElementById('env-pill').className = 'env-pill';
    document.getElementById('curr-pill').classList.add('hidden');
    document.getElementById('merchant-pill').textContent = '';
    document.querySelectorAll('.env-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('env-out').style.display = 'none';
    flash('Session direset.');
}

async function apiFetch(url, body) {
    try {
        const opts = body
            ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : { method: 'GET' };
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) {
            flash('Error: ' + (data.error || res.status));
            const active = document.querySelector('.page.active');
            const out = active?.querySelector('.output-body');
            if (out) out.innerHTML = `<span class="err">✗ Server error: ${data.error || res.status}</span>`;
            return null;
        }
        return data;
    } catch (e) {
        flash('Fetch error: ' + e.message);
        return null;
    }
}

function formatResponse(data, title) {
    const ts = new Date().toLocaleTimeString();
    let status = 'success', statusText = 'OK';
    if (data.error || data.status === 'error' || (data.code && data.code >= 400)) {
        status = 'error'; statusText = 'ERROR';
    } else if (data.status === 'pending' || data.code === 202) {
        status = 'warn'; statusText = 'PENDING';
    }

    let html = `<div class="resp-card">
        <div class="resp-header">
            <span class="resp-status ${status}">${statusText}</span>
            <span class="resp-title">${escapeHtml(title)}</span>
            <span class="resp-time">${ts}</span>
        </div>
        <div class="resp-body">`;

    const kvPairs = [];
    const jsonData = {};

    Object.entries(data).forEach(([key, val]) => {
        if (typeof val === 'object' && val !== null) {
            jsonData[key] = val;
        } else {
            let cls = '';
            const kl = key.toLowerCase();
            if (kl.includes('url') || kl.includes('link')) cls = 'url';
            if (kl.includes('code') || kl.includes('status') || kl.includes('sign')) cls = 'code';
            kvPairs.push([key, String(val), cls]);
        }
    });

    if (kvPairs.length > 0) {
        html += `<div class="resp-section">
            <div class="resp-section-title ${status === 'error' ? 'error' : ''}">Response Fields</div>
            <div class="resp-kv">`;
        kvPairs.forEach(([k, v, cls]) => {
            html += `<span class="resp-kv-key">${escapeHtml(k)}</span>
                    <span class="resp-kv-val ${cls}">${escapeHtml(v)}</span>`;
        });
        html += `</div></div>`;
    }

    Object.entries(jsonData).forEach(([key, val]) => {
        html += `<div class="resp-section">
            <div class="resp-section-title">${escapeHtml(key)}</div>
            <div class="resp-json">${syntaxHighlight(JSON.stringify(val, null, 2))}</div>
        </div>`;
    });

    html += `<hr class="resp-divider">
        <div class="resp-section">
            <div class="resp-section-title dim">Full Response</div>
            <div class="resp-json">${syntaxHighlight(JSON.stringify(data, null, 2))}</div>
        </div>
        </div></div>`;
    return html;
}

function renderSuccessCard(title, subtitle) {
    return `<div class="resp-card">
        <div class="resp-header">
            <span class="resp-status success">SUCCESS</span>
            <span class="resp-title">${escapeHtml(title)}</span>
        </div>
        <div class="resp-body">
            ${subtitle ? `<div class="resp-section"><div class="resp-kv">
                <span class="resp-kv-key">Message</span>
                <span class="resp-kv-val">${escapeHtml(subtitle)}</span>
            </div></div>` : ''}`;
}

function renderErrorCard(message, title) {
    return `<div class="resp-card">
        <div class="resp-header">
            <span class="resp-status error">ERROR</span>
            <span class="resp-title">${escapeHtml(title || 'Error')}</span>
        </div>
        <div class="resp-body">
            <div class="resp-section">
                <div class="resp-section-title error">Details</div>
                <div class="resp-kv">
                    <span class="resp-kv-key">Message</span>
                    <span class="resp-kv-val" style="color:var(--red)">${escapeHtml(message)}</span>
                </div>
            </div>
        </div>
    </div>`;
}

function renderWarningCard(title, message) {
    return `<div class="resp-card">
        <div class="resp-header">
            <span class="resp-status warn">WARNING</span>
            <span class="resp-title">${escapeHtml(title)}</span>
        </div>
        <div class="resp-body">
            <div class="resp-section">
                <div class="resp-section-title warn">Details</div>
                <div class="resp-kv">
                    <span class="resp-kv-key">Message</span>
                    <span class="resp-kv-val" style="color:var(--amber)">${escapeHtml(message)}</span>
                </div>
            </div>
        </div>
    </div>`;
}

function renderInfoCard(title, subtitle, fields) {
    let html = `<div class="resp-card">
        <div class="resp-header">
            <span class="resp-status info">INFO</span>
            <span class="resp-title">${escapeHtml(title)}</span>
        </div>
        <div class="resp-body">`;
    if (subtitle) {
        html += `<div class="resp-section"><div class="resp-kv">
            <span class="resp-kv-key">Note</span>
            <span class="resp-kv-val muted">${escapeHtml(subtitle)}</span>
        </div></div>`;
    }
    if (fields && fields.length) {
        html += `<div class="resp-section"><div class="resp-kv">`;
        fields.forEach(([k, v, cls]) => {
            html += `<span class="resp-kv-key">${escapeHtml(k)}</span>
                    <span class="resp-kv-val ${cls || ''}">${escapeHtml(v || '-')}</span>`;
        });
        html += `</div></div>`;
    }
    html += `</div></div>`;
    return html;
}

function syntaxHighlight(json) {
    json = escapeHtml(json);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) cls = 'json-key';
            else cls = 'json-string';
        } else if (/true|false/.test(match)) {
            cls = 'json-bool';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

$(document).ready(function() {
    $('#e-currency').select2({
        placeholder: "-- pilih currency --",
        allowClear: true,
        width: '100%'
    }).on('change', function() {
        onCurrencyChange();
    }).on('select2:open', function() {
        setTimeout(() => {
            document.querySelector('.select2-search__field').focus();
        }, 50);
    });

    $('#e-merchant').select2({
        placeholder: "-- pilih merchant --",
        allowClear: true,
        width: '100%'
    }).on('change', function() {
        S.merchant = $(this).val();
    });
});