// ─── State ───────────────────────────────────────────────────────────────────
const S = {
    envKey: null, currency: null, merchant: null,
    envInfo: null, loadedConfig: null,
    depositTab: 's88-v2', payoutTab: 's88-regular', batchTab: 'dep', encTab: 'enc'
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
    const $m = $('#e-merchant');
    $m.html('<option value="">-- loading --</option>').trigger('change');
    if (!curr || !S.envKey) { $m.html('<option value="">-- pilih merchant --</option>').trigger('change'); return; }
    const res = await apiFetch('/api/merchants', { envKey: S.envKey, currency: curr });
    if (!res) return;
    let opts = '<option value="">-- pilih merchant --</option>';
    res.merchants.forEach(m => opts += `<option value="${m}">${m}</option>`);
    $m.html(opts).trigger('change');
    if (res.merchants.length === 1) { $m.val(res.merchants[0]).trigger('change'); S.merchant = res.merchants[0]; }
}

async function loadEnvConfig() {
    if (!S.envKey) { showEnvOut('<span class="err">✗ Pilih environment terlebih dahulu.</span>'); return; }
    const curr = $('#e-currency').val();
    const merch = $('#e-merchant').val();
    S.currency = curr; S.merchant = merch;
    const res = await apiFetch('/api/env-vars', { envKey: S.envKey, currency: curr, merchant: merch });
    if (!res) return;
    S.loadedConfig = res.config;
    if (v('e-baseurl'))   S.loadedConfig.baseUrl   = v('e-baseurl');
    if (v('e-depmethod')) S.loadedConfig.depMethod  = v('e-depmethod');
    if (v('e-paymethod')) S.loadedConfig.payMethod  = v('e-paymethod');
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
    document.getElementById('env-out').style.display = 'block';
    document.getElementById('env-out-body').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

function dtab(t) {
    S.depositTab = t;
    document.querySelectorAll('#tr-dep-s88 .tab, #tr-dep-paybo .tab')
        .forEach(b => b.classList.remove('active'));
    document.getElementById('dtab-' + t)?.classList.add('active');
    document.getElementById('d-depbank-wrap').classList.toggle('hidden', S.currency !== 'THB');
}

function ptab(t) {
    S.payoutTab = t;
    document.querySelectorAll('#tr-pay-s88 .tab, #tr-pay-paybo .tab')
        .forEach(b => b.classList.remove('active'));
    document.getElementById('ptab-' + t)?.classList.add('active');
}

function btab(t) {
    S.batchTab = t;
    document.querySelectorAll('[id^="btab-"]').forEach(b => b.classList.toggle('active', b.id === 'btab-' + t));
}

function etab(t) {
    S.encTab = t;
    document.querySelectorAll('[id^="etab-"]').forEach(b => b.classList.toggle('active', b.id === 'etab-' + t));
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPOSIT
// Response shapes:
//   V2/V3/V4 (S88 & PayBO):  { payload, qs, encrypted, paymentUrl, txCode, userID, name, ip }
//   V5 (PayBO):              { payload, payloadStr, signature, encryptedMC, depositUrl, txCode }
// ═══════════════════════════════════════════════════════════════════════════

async function runDeposit() {
    if (!assertConfig()) return;
    const amount = v('d-amount');
    if (!amount) { flash('Amount wajib diisi!'); return; }

    const out = document.getElementById('dep-body');
    out.innerHTML = '<div class="out-placeholder">Mengenkripsi payload…</div>';
    setBadge('dep', 'loading', 'Memproses…');
    spinEl('dep-spin', true);

    const isV5 = S.depositTab === 'paybo-v5';
    const res = await apiFetch(
        isV5 ? '/api/deposit/prepare-v5' : '/api/deposit/prepare',
        {
            envKey: S.envKey, currency: S.currency, merchant: S.merchant,
            version: S.depositTab, amount,
            bankCode: v('d-bankcode'), depositorBank: v('d-depbank'),
            txCode: v('d-txcode'), redirectUrl: v('d-redirect'), callbackUrl: v('d-callback')
        }
    );
    spinEl('dep-spin', false);
    if (!res) { setBadge('dep', 'err', '✗ Error'); return; }

    setBadge('dep', 'ok', '✓ Generated');
    out.innerHTML = isV5 ? renderDepositV5(res) : renderDepositV2V4(res);
    bindToggles(out);
    logAction('DEPOSIT', `${S.depositTab} · ${S.currency} ${amount}`);
}

// ── Deposit V2/V3/V4 renderer ─────────────────────────────────────────────────
function renderDepositV2V4(r) {
    const version = S.depositTab.toUpperCase();
    const isPayBO = S.depositTab.startsWith('paybo');
    
    // URL path berbeda per versi
    const versionPath = {
        's88-v2': 'v2', 's88-v3': 'v3', 's88-v4': 'v4',
        'paybo-v2': 'v2', 'paybo-v3': 'v3', 'paybo-v4': 'v4'
    }[S.depositTab] || 'v2';

    return sec('Ringkasan', 'green',
        kv('Versi', version) +
        kv('Provider', isPayBO ? 'PayBO' : 'S88') +
        kv('Currency', S.currency) +
        kv('TX Code', r.txCode, 'mono') +
        kv('User ID', r.userID) +
        kv('Name', r.name) +
        kv('IP', r.ip)
    ) +
    sec('Payment URL', 'blue',
        kv('URL', `<a class="out-v url" href="${r.paymentUrl}" target="_blank">${r.paymentUrl}</a>`, '', true) +
        kv('Method', 'GET (buka di browser)') +
        `<div class="out-hint">Klik URL di atas untuk membuka payment page</div>`
    ) +
    sec('Payload (sebelum enkripsi)', 'gray',
        `<div class="out-code">${esc(r.qs)}</div>`, true
    ) +
    sec('Encrypted key', 'amber',
        `<div class="out-code enc-text">${r.encrypted}</div>` +
        `<div class="out-hint">key ini yang dikirim sebagai query param <code>?key=</code></div>`, true
    ) +
    sec('Full payload JSON', 'gray',
        `<div class="out-code">${esc(JSON.stringify(r.payload, null, 2))}</div>`, true
    );
}

// ── Deposit V5 (PayBO) renderer ───────────────────────────────────────────────
function renderDepositV5(r) {
    const curlSnippet = `curl -X POST "${r.depositUrl}" \\
  -H "Content-Type: application/json" \\
  -H "sign: ${r.signature}" \\
  -d '${JSON.stringify(r.payload)}'`;

    return sec('Ringkasan', 'green',
        kv('Versi', 'PayBO V5') +
        kv('Currency', S.currency) +
        kv('TX Code', r.txCode, 'mono')
    ) +
    sec('Deposit URL', 'blue',
        kv('URL', `<a class="out-v url" href="${r.depositUrl}" target="_blank">${r.depositUrl}</a>`, '', true) +
        kv('Method', 'POST')
    ) +
    sec('Signature (header: sign)', 'amber',
        `<div class="out-code sig-text">${r.signature}</div>` +
        `<div class="out-hint">Kirim sebagai request header: <code>sign: [value]</code></div>`
    ) +
    sec('Encrypted Merchant Code (header)', 'amber',
        `<div class="out-code enc-text">${r.encryptedMC}</div>` +
        `<div class="out-hint">Kirim sebagai header: <code>X-Encrypted-MerchantCode: [value]</code></div>`, true
    ) +
    sec('Payload JSON (request body)', 'blue',
        `<div class="out-code">${esc(JSON.stringify(r.payload, null, 2))}</div>`, true
    ) +
    sec('cURL snippet', 'gray',
        `<div class="out-code">${esc(curlSnippet)}</div>`, true
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYOUT
// Response shapes:
//   Regular (S88 & PayBO): { payload, encrypted, payoutUrl, txCode, version:"regular" }
//   V5 (S88 & PayBO):      { payload, signature, payoutUrl, txCode, version:"v5" }
// ═══════════════════════════════════════════════════════════════════════════

async function runPayout() {
    if (!assertConfig()) return;
    const amount = v('p-amount');
    if (!amount) { flash('Amount wajib diisi!'); return; }

    const out = document.getElementById('pay-body');
    out.innerHTML = '<div class="out-placeholder">Mengenkripsi payload…</div>';
    setBadge('pay', 'loading', 'Memproses…');
    spinEl('pay-spin', true);

    const isV5 = S.payoutTab.includes('v5');
    const res = await apiFetch('/api/payout/prepare', {
        envKey: S.envKey, currency: S.currency, merchant: S.merchant,
        version: isV5 ? 'v5' : 'regular', amount,
        bankCode: v('p-bankcode'), accountName: v('p-accname'),
        txCode: v('p-txcode')
    });
    spinEl('pay-spin', false);
    if (!res) { setBadge('pay', 'err', '✗ Error'); return; }

    setBadge('pay', 'ok', '✓ Generated');
    out.innerHTML = isV5 ? renderPayoutV5(res) : renderPayoutRegular(res);
    bindToggles(out);
    logAction('PAYOUT', `${S.payoutTab} · ${S.currency} ${amount}`);
}

// ── Payout Regular renderer ───────────────────────────────────────────────────
function renderPayoutRegular(r) {
    const isPayBO = S.payoutTab.startsWith('paybo');
    const curlSnippet = `curl -X POST "${r.payoutUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"key":"${r.encrypted}"}'`;

    return sec('Ringkasan', 'green',
        kv('Versi', isPayBO ? 'PayBO Regular' : 'S88 Regular') +
        kv('Currency', S.currency) +
        kv('TX Code', r.txCode, 'mono') +
        kv('Account name', r.payload?.account_name || '—') +
        kv('Bank account', r.payload?.bank_account_number || '—') +
        (r.payload?.bank_code ? kv('Bank code', r.payload.bank_code) : '') +
        (r.payload?.ifsc_code ? kv('IFSC code', r.payload.ifsc_code) : '')
    ) +
    sec('Payout URL', 'blue',
        kv('URL', `<a class="out-v url" href="${r.payoutUrl}" target="_blank">${r.payoutUrl}</a>`, '', true) +
        kv('Method', 'POST') +
        kv('Body format', '{ "key": "[encrypted]" }')
    ) +
    sec('Encrypted key', 'amber',
        `<div class="out-code enc-text">${r.encrypted}</div>` +
        `<div class="out-hint">Kirim sebagai body: <code>{ "key": "[value]" }</code></div>`
    ) +
    sec('Payload JSON (sebelum enkripsi)', 'gray',
        `<div class="out-code">${esc(JSON.stringify(r.payload, null, 2))}</div>`, true
    ) +
    sec('cURL snippet', 'gray',
        `<div class="out-code">${esc(curlSnippet)}</div>`, true
    );
}

// ── Payout V5 renderer ────────────────────────────────────────────────────────
function renderPayoutV5(r) {
    const isPayBO = S.payoutTab.startsWith('paybo');
    const curlSnippet = `curl -X POST "${r.payoutUrl}" \\
  -H "Content-Type: application/json" \\
  -H "sign: ${r.signature}" \\
  -d '${JSON.stringify(r.payload)}'`;

    return sec('Ringkasan', 'green',
        kv('Versi', isPayBO ? 'PayBO V5' : 'S88 V5') +
        kv('Currency', S.currency) +
        kv('TX Code', r.txCode, 'mono') +
        kv('Account name', r.payload?.account_name || '—') +
        kv('Bank account', r.payload?.bank_account_number || '—') +
        (r.payload?.bank_code ? kv('Bank code', r.payload.bank_code) : '') +
        (r.payload?.ifsc_code ? kv('IFSC code', r.payload.ifsc_code) : '')
    ) +
    sec('Payout URL', 'blue',
        kv('URL', `<a class="out-v url" href="${r.payoutUrl}" target="_blank">${r.payoutUrl}</a>`, '', true) +
        kv('Method', 'POST')
    ) +
    sec('Signature (header: sign)', 'amber',
        `<div class="out-code sig-text">${r.signature}</div>` +
        `<div class="out-hint">Kirim sebagai request header: <code>sign: [value]</code></div>`
    ) +
    sec('Payload JSON (request body)', 'blue',
        `<div class="out-code">${esc(JSON.stringify(r.payload, null, 2))}</div>`, true
    ) +
    sec('cURL snippet', 'gray',
        `<div class="out-code">${esc(curlSnippet)}</div>`, true
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH
// ═══════════════════════════════════════════════════════════════════════════

function autoFillBatch() {
    const count = parseInt(v('b-count')) || 3;
    const banks = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'PNB'];
    document.getElementById('b-json').value = JSON.stringify(
        Array.from({ length: count }, (_, i) => ({ amount: (i + 1) * 5000, bank_code: banks[i % 5] })),
        null, 2
    );
}

async function runBatch() {
    if (!assertConfig()) return;
    let entries;
    try { entries = JSON.parse(document.getElementById('b-json').value || '[]'); }
    catch (e) { document.getElementById('batch-body').innerHTML = `<div class="out-placeholder err">✗ JSON tidak valid: ${e.message}</div>`; return; }
    if (!entries.length) { autoFillBatch(); try { entries = JSON.parse(document.getElementById('b-json').value); } catch (_) {} }

    setBadge('batch', 'loading', 'Memproses…');
    spinEl('batch-spin', true);
    const version = document.getElementById('b-version').value;
    const endpoint = S.batchTab === 'dep' ? '/api/batch/deposit' : '/api/batch/payout';
    const res = await apiFetch(endpoint, { envKey: S.envKey, currency: S.currency, merchant: S.merchant, entries, version });
    spinEl('batch-spin', false);
    if (!res) { setBadge('batch', 'err', '✗ Error'); return; }

    setBadge('batch', 'ok', `✓ ${res.count} entries`);
    const isV5 = version === 'v5';
    const out = document.getElementById('batch-body');

    out.innerHTML = res.results.map((r, i) => {
        const body = kv('TX Code', r.txCode, 'mono') +
            (r.name ? kv('Name', r.name) : '') +
            (r.paymentUrl ? kv('Payment URL', `<a class="out-v url" href="${r.paymentUrl}" target="_blank">${r.paymentUrl}</a>`, '', true) : '') +
            (r.payoutUrl  ? kv('Payout URL',  `<a class="out-v url" href="${r.payoutUrl}"  target="_blank">${r.payoutUrl}</a>`, '', true) : '') +
            (r.encrypted  ? kv('Encrypted key', `<span class="out-v enc-text" title="${r.encrypted}">${r.encrypted.substring(0, 72)}…</span>`, '', true) : '') +
            (r.signature  ? kv('Signature',     `<span class="out-v sig-text" title="${r.signature}">${r.signature.substring(0, 72)}…</span>`, '', true) : '');
        return sec(`Entry ${i + 1} — ${r.txCode}`, i === 0 ? 'green' : 'gray', body, i > 0);
    }).join('') +
    sec('Full JSON', 'blue', `<div class="out-code">${esc(JSON.stringify(res.results, null, 2))}</div>`, true);

    bindToggles(out);
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL CALLBACK
// ═══════════════════════════════════════════════════════════════════════════

async function runCallback() {
    const url = v('cb-url');
    if (!url) { flash('Callback URL wajib diisi!'); return; }
    let extra = {};
    try { const ev = v('cb-extra'); if (ev) extra = JSON.parse(ev); }
    catch (e) { flash('Extra JSON tidak valid: ' + e.message); return; }

    const amount = v('cb-amount'), currency = v('cb-currency');
    const payload = {
        transaction_code: v('cb-tx'), status: v('cb-status'),
        ...(amount   && { amount: Number(amount) }),
        ...(currency && { currency_code: currency }),
        ...extra
    };

    setBadge('cb', 'loading', 'Mengirim…');
    spinEl('cb-spin', true);

    let ok = false;
    try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), mode: 'no-cors' });
        ok = true;
    } catch (_) {}

    spinEl('cb-spin', false);
    setBadge('cb', ok ? 'ok' : 'warn', ok ? '✓ Terkirim' : '⚠ CORS');

    const out = document.getElementById('cb-body');
    out.innerHTML =
        sec('Request', 'green',
            kv('URL', `<a class="out-v url" href="${url}" target="_blank">${url}</a>`, '', true) +
            kv('Method', 'POST') +
            kv('Mode', 'no-cors (browser)')
        ) +
        sec('Payload JSON', 'blue',
            `<div class="out-code">${esc(JSON.stringify(payload, null, 2))}</div>`, true
        ) +
        sec('cURL equivalent', 'gray',
            `<div class="out-code">${esc(`curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload)}'`)}</div>`, true
        );
    bindToggles(out);
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK WD STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function runCheckWD() {
    if (!assertConfig()) return;
    const reqNo = v('wd-reqno');
    if (!reqNo) { flash('Request No wajib diisi!'); return; }

    const res = await apiFetch('/api/check-wd-status', { envKey: S.envKey, currency: S.currency, merchant: S.merchant, requestNo: reqNo });
    if (!res) return;

    const curlSnippet = `curl -X POST "${res.url}" \\
  -H "Content-Type: application/json" \\
  -H "sign: ${res.signature}" \\
  -d '${JSON.stringify(res.payload)}'`;

    const out = document.getElementById('wd-body');
    out.innerHTML =
        sec('Request', 'green',
            kv('URL', `<a class="out-v url" href="${res.url}" target="_blank">${res.url}</a>`, '', true) +
            kv('Method', 'POST') +
            kv('Request No', reqNo, 'mono')
        ) +
        sec('Headers', 'blue',
            kv('Content-Type', 'application/json') +
            kv('sign', `<span class="out-v sig-text">${res.signature}</span>`, '', true)
        ) +
        sec('Payload JSON', 'gray',
            `<div class="out-code">${esc(JSON.stringify(res.payload, null, 2))}</div>`, true
        ) +
        sec('cURL snippet', 'gray',
            `<div class="out-code">${esc(curlSnippet)}</div>`, true
        );
    bindToggles(out);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPT / DECRYPT
// ═══════════════════════════════════════════════════════════════════════════

async function runEncrypt() {
    const input = v('enc-input');
    if (!input) { flash('Input kosong!'); return; }
    const apiKey = v('enc-api') || S.loadedConfig?.merchantAPI;
    const secKey = v('enc-sec') || S.loadedConfig?.secretKey;
    if (!apiKey || !secKey) { flash('API key / Secret key tidak tersedia!'); return; }

    const out = document.getElementById('enc-body');

    if (S.encTab === 'sign') {
        const res = await apiFetch('/api/sign', { data: input, secretKey: secKey });
        if (!res) return;
        out.innerHTML = sec('HMAC-SHA256 Signature', 'amber',
            `<div class="out-code sig-text">${res.signature}</div>` +
            `<div class="out-hint">Gunakan sebagai header: <code>sign: [value]</code></div>`
        );
        bindToggles(out);
        return;
    }

    const action = S.encTab === 'dec' ? 'decrypt' : 'encrypt';
    const data = S.encTab === 'epayout'
        ? (() => { try { return JSON.parse(input); } catch { return input; } })()
        : input;
    const res = await apiFetch('/api/encrypt', { action, data, apiKey, secretKey: secKey });
    if (!res) return;
    const result = typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : res.result;

    out.innerHTML =
        sec(`${action === 'encrypt' ? 'Encrypted' : 'Decrypted'} result`, 'green',
            `<div class="out-code ${action === 'encrypt' ? 'enc-text' : ''}">${esc(result)}</div>` +
            (action === 'encrypt'
                ? `<div class="out-hint">Hasil enkripsi AES-256-CBC — siap dipakai sebagai <code>?key=</code> param atau body</div>`
                : `<div class="out-hint">Hasil dekripsi — ini adalah query string / JSON payload asli</div>`)
        );
    bindToggles(out);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG PAGE
// ═══════════════════════════════════════════════════════════════════════════

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
        env: S.envKey, currency: S.currency, merchant: S.merchant,
        baseUrl: S.loadedConfig?.baseUrl, depMethod: S.loadedConfig?.depMethod, payMethod: S.loadedConfig?.payMethod,
        merchantCode: S.loadedConfig?.merchantCode, apiKey: '[REDACTED]', secretKey: '[REDACTED]'
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' }));
    a.download = 's88-config.json'; a.click();
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET / LOGS
// ═══════════════════════════════════════════════════════════════════════════

let ws;
function initWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);
    ws.onopen  = () => document.getElementById('ws-dot').classList.add('on');
    ws.onclose = () => { document.getElementById('ws-dot').classList.remove('on'); setTimeout(initWS, 3000); };
    ws.onmessage = (e) => {
        try {
            const d = JSON.parse(e.data);
            if (d.type === 'log')  addLog(d);
            if (d.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch (_) {}
    };
}

function addLog(d) {
    const el = document.getElementById('log-list');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const t = new Date(d.ts).toLocaleTimeString();
    entry.innerHTML = `<span class="log-ts">${t}</span><span class="log-action">${d.action || ''}</span>` +
        `<span style="color:var(--text3)">${d.env || ''}</span> ${d.currency || ''} ${d.merchant || ''} ` +
        `${d.amount ? '→ ' + d.amount : ''} ${d.count ? `(${d.count} entries)` : ''}`;
    if (el.firstChild?.textContent?.includes('Menunggu')) el.innerHTML = '';
    el.insertBefore(entry, el.firstChild);
    if (el.children.length > 200) el.removeChild(el.lastChild);
}

function logAction(action, detail) {
    addLog({ action, env: S.envInfo?.label || '', currency: S.currency || '', merchant: S.merchant || '', amount: detail, ts: Date.now() });
}

function clearLogs() {
    document.getElementById('log-list').innerHTML = '<span style="color:var(--text3)">Log dibersihkan.</span>';
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT HELPERS — collapsible sections
// ═══════════════════════════════════════════════════════════════════════════

const DOT_COLORS = { green: 'sdot-green', blue: 'sdot-blue', amber: 'sdot-amber', red: 'sdot-red', gray: 'sdot-gray' };

function sec(title, color, bodyHtml, collapsed = false) {
    const dc = DOT_COLORS[color] || 'sdot-gray';
    return `<div class="out-section">
        <div class="out-section-hd">
            <div class="out-section-title"><span class="sdot ${dc}"></span>${esc(title)}</div>
            <span class="out-toggle${collapsed ? ' col' : ''}">▾</span>
        </div>
        <div class="out-section-bd${collapsed ? ' col' : ''}">${bodyHtml}</div>
    </div>`;
}

function kv(key, val, valClass = '', raw = false) {
    const safeVal = raw ? val : `<span class="out-v ${valClass}">${esc(String(val))}</span>`;
    return `<div class="out-kv"><span class="out-k">${esc(key)}</span>${safeVal}</div>`;
}

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindToggles(container) {
    container.querySelectorAll('.out-section-hd').forEach(h => {
        h.onclick = () => {
            const bd = h.nextElementSibling;
            const ar = h.querySelector('.out-toggle');
            bd.classList.toggle('col');
            ar.classList.toggle('col');
        };
    });
}

function setBadge(prefix, type, text) {
    const el = document.getElementById(prefix + '-badge');
    if (!el) return;
    el.textContent = text;
    el.className = 'out-badge ' + type;
    el.classList.remove('hidden');
}

function spinEl(id, on) { document.getElementById(id)?.classList.toggle('hidden', !on); }

function copyOutput(id) {
    navigator.clipboard.writeText(document.getElementById(id)?.innerText || '')
        .then(() => flash('Disalin!')).catch(() => {});
}

function genTx(id, prefix) {
    const ts = Math.floor(Date.now() / 1000);
    document.getElementById(id).value = `${prefix}-${ts}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function flash(msg) {
    const el = document.getElementById('copy-flash');
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}

function v(id) { return document.getElementById(id)?.value?.trim() || ''; }

function assertConfig() {
    if (!S.envKey)       { flash('Pilih environment terlebih dahulu!'); return false; }
    if (!S.currency)     { flash('Pilih currency terlebih dahulu!'); return false; }
    if (!S.loadedConfig) { flash('Klik "Load konfigurasi" di halaman Environment!'); return false; }
    return true;
}

function clearSession() {
    S.envKey = null; S.currency = null; S.merchant = null; S.envInfo = null; S.loadedConfig = null;
    document.getElementById('env-pill').textContent = '— belum dipilih';
    document.getElementById('env-pill').className = 'env-pill';
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
            return null;
        }
        return data;
    } catch (e) {
        flash('Fetch error: ' + e.message);
        return null;
    }
}

// ─── Select2 init ─────────────────────────────────────────────────────────────
$(document).ready(function () {
    $('#e-currency').select2({
        placeholder: '-- pilih currency --', allowClear: true, width: '100%'
    }).on('change', function () {
        onCurrencyChange();
    }).on('select2:open', function () {
        setTimeout(() => document.querySelector('.select2-search__field')?.focus(), 50);
    });

    $('#e-merchant').select2({
        placeholder: '-- pilih merchant --', allowClear: true, width: '100%'
    }).on('change', function () {
        S.merchant = $(this).val();
    });
});