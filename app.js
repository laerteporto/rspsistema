// app.js - RSP System v2 — localStorage é a fonte de verdade
// Firebase é secundário (sync em background). Nunca sobrescreve dados locais frescos.

// ─── Firebase Config ───────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyBlJ9QtqdMql5WM7AysOAW-KMGRlkqo7bE",
    authDomain: "rpssystem.firebaseapp.com",
    projectId: "rpssystem",
    storageBucket: "rpssystem.firebasestorage.app",
    messagingSenderId: "1043377468490",
    appId: "1:1043377468490:web:fc9cccacb9558441b6a2b3"
};

let db = null;

function initFirebase() {
    try {
        if (!firebase.apps || firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        console.log('🔥 Firebase instanciado');
    } catch (e) {
        console.warn('⚠️ Firebase indisponível:', e.message);
        db = null;
    }
}

// ─── Sync OS antigas do localStorage → Firebase ───────────────────────────
async function syncLocalToFirebase() {
    if (!db) return { synced: 0, failed: 0 };
    const local = LS.getOrders();
    if (!local.length) return { synced: 0, failed: 0 };

    // Lê lista negra diretamente do localStorage (sem helper)
    var deletedIds = [];
    try { deletedIds = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(e) {}

    let synced = 0, failed = 0;
    for (const order of local) {
        const id = String(order.id);

        // NUNCA sincroniza OS que foram excluídas
        if (deletedIds.indexOf(id) !== -1) {
            console.log('⛔ OS #' + id + ' na lista negra — ignorada');
            continue;
        }

        try {
            const snap = await db.collection('orders').doc(id).get();
            if (!snap.exists) {
                await db.collection('orders').doc(id).set(order);
                synced++;
                console.log('☁️ OS #' + id + ' sincronizada');
            }
        } catch(e) {
            failed++;
            console.warn('Sync OS #' + id + ':', e.message);
        }
    }
    if (synced > 0) showToast('☁️ ' + synced + ' OS(s) enviada(s) para a nuvem!', 'success', 5000);
    return { synced, failed };
}

// Chamada manual pelo botão "Sincronizar" no dashboard
window.forceSyncAll = async function() {
    const btn = document.getElementById('btn-sync');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }

    if (!db) {
        showToast('❌ Firebase não conectado. Verifique sua internet.', 'error', 6000);
        if (btn) { btn.disabled = false; btn.textContent = '☁️ Sincronizar'; }
        return;
    }

    try {
        const result = await syncLocalToFirebase();
        if (result.synced === 0 && result.failed === 0) {
            showToast('✅ Tudo sincronizado! Nenhum orçamento pendente.', 'success', 4000);
        } else if (result.failed > 0) {
            showToast('⚠️ ' + result.synced + ' sincronizados, ' + result.failed + ' falharam. Verifique sua internet.', 'error', 6000);
        }
    } catch(e) {
        showToast('❌ Erro na sincronização: ' + e.message, 'error', 6000);
    }

    if (btn) { btn.disabled = false; btn.textContent = '☁️ Sincronizar'; }
};

// ─── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 4000) {
    let el = document.getElementById('_rsp_toast');
    if (!el) {
        el = document.createElement('div');
        el.id = '_rsp_toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast ' + type;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── LocalStorage — FONTE DE VERDADE ──────────────────────────────────────
const LS = {
    getOrders: () => {
        try { return JSON.parse(localStorage.getItem('rsp_orders')) || []; }
        catch(e) { return []; }
    },
    saveOrders: (v) => {
        try { localStorage.setItem('rsp_orders', JSON.stringify(v)); }
        catch(e) { console.error('LS saveOrders:', e); }
    },
    getClients: () => {
        try { return JSON.parse(localStorage.getItem('rsp_clients')) || []; }
        catch(e) { return []; }
    },
    saveClients: (v) => {
        try { localStorage.setItem('rsp_clients', JSON.stringify(v)); }
        catch(e) { console.error('LS saveClients:', e); }
    },
    getSettings: () => {
        try {
            return JSON.parse(localStorage.getItem('rsp_settings')) ||
                { companyName: 'RSP PRESTAÇÃO DE SERVIÇOS', owner: 'Rogério Porto', phone: '(62) 98114-7395' };
        } catch(e) {
            return { companyName: 'RSP PRESTAÇÃO DE SERVIÇOS', owner: 'Rogério Porto', phone: '(62) 98114-7395' };
        }
    },
    saveSettings: (v) => {
        try { localStorage.setItem('rsp_settings', JSON.stringify(v)); }
        catch(e) { console.error('LS saveSettings:', e); }
    },
};

// ─── Persist Order: localStorage imediato + Firebase background ────────────
async function persistOrder(orderData) {
    const id = String(orderData.id);

    // 1. Salva LOCAL imediato
    const orders = LS.getOrders();
    const idx = orders.findIndex(o => String(o.id) === id);
    if (idx >= 0) orders[idx] = orderData; else orders.push(orderData);
    LS.saveOrders(orders);
    console.log('💾 OS #' + id + ' salva local');

    // 2. Firebase — aguarda confirmação para garantir que o cliente acesse
    if (db) {
        try {
            await db.collection('orders').doc(id).set(orderData);
            console.log('☁️ OS #' + id + ' confirmada no Firebase');
            return true;
        } catch(e) {
            console.error('❌ Firebase OS FALHOU:', e.code, e.message);
            showToast('⚠️ Salvo localmente. Firebase indisponível: ' + e.message, 'error', 8000);
            return false;
        }
    }
    return true;
}

// ─── Persist Client: localStorage imediato + Firebase background ───────────
function persistClient(clientData) {
    const clients = LS.getClients();
    const idx = clients.findIndex(c => c.phone === clientData.phone);
    if (idx >= 0) {
        clients[idx] = { ...clients[idx], ...clientData }; // atualiza se existe
    } else {
        clients.push(clientData);
    }
    LS.saveClients(clients);
    console.log('💾 Cliente salvo local:', clientData.name);

    // Firebase background
    if (db) {
        db.collection('clients').where('phone', '==', clientData.phone).get()
            .then(snap => {
                if (snap.empty) {
                    db.collection('clients').add(clientData)
                        .then(() => console.log('☁️ Cliente Firebase:', clientData.name))
                        .catch(e => console.warn('⚠️ Firebase add client:', e.message));
                }
            })
            .catch(e => console.warn('⚠️ Firebase query client:', e.message));
    }
}

// ─── Load Orders: local + merge Firebase (sem sobrescrever local) ──────────
async function loadAllOrders() {
    const local = LS.getOrders();
    if (!db) return local;
    try {
        const snap = await db.collection('orders').get();
        if (snap.empty) return local;
        const remote = snap.docs.map(d => ({ ...d.data(), _fbDocId: d.id }));
        // Merge: local tem prioridade (mais recente)
        const map = {};
        remote.forEach(o => { map[String(o.id)] = o; });
        local.forEach(o  => { map[String(o.id)] = o; }); // local sobrescreve remote
        const merged = Object.values(map);
        LS.saveOrders(merged);
        return merged;
    } catch (e) {
        console.warn('Firebase loadOrders:', e.message);
        return local;
    }
}

// ─── Load Clients: local + merge Firebase (sem sobrescrever local) ─────────
async function loadAllClients() {
    const local = LS.getClients();
    if (!db) return local;
    try {
        const snap = await db.collection('clients').get();
        if (snap.empty) return local;
        const remote = snap.docs.map(d => ({ ...d.data(), _fbDocId: d.id }));
        // Merge: local tem prioridade
        const map = {};
        remote.forEach(c => { map[c.phone] = c; });
        local.forEach(c  => { map[c.phone] = c; }); // local sobrescreve
        const merged = Object.values(map);
        LS.saveClients(merged);
        return merged;
    } catch (e) {
        console.warn('Firebase loadClients:', e.message);
        return local;
    }
}

const generateId = () => Math.floor(10000 + Math.random() * 90000);

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setActiveNav() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === page);
    });
}

function statusBadge(status) {
    const map = {
        pending:           { label: '⏸ Pendente',           cls: 'badge-pending'   },
        awaiting_approval: { label: '⏳ Aguardando Cliente', cls: 'badge-pending'   },
        approved:          { label: '✅ Aprovado',           cls: 'badge-approved'  },
        rejected:          { label: '❌ Recusado',           cls: 'badge-rejected'  },
        completed:         { label: '🏁 Concluído',          cls: 'badge-completed' },
    };
    const s = map[status] || { label: 'Pendente', cls: 'badge-pending' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
}

// ─── Router ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setActiveNav();
    if (document.getElementById('service-form'))       initServiceForm();
    if (document.getElementById('dashboard-table'))    initDashboard();
    if (document.getElementById('reports-container'))  initReports();
    if (document.getElementById('clientes-container')) initClientsPage();
    if (document.getElementById('config-container'))   initConfigPage();
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
async function initDashboard() {
    const tbody = document.querySelector('#dashboard-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">⏳ Carregando...</td></tr>';

    function renderOrders(orders) {
        const sorted = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));
        tbody.innerHTML = '';
        if (!sorted.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted);">
                <div style="font-size:2rem;margin-bottom:.5rem;">📋</div>
                Nenhuma OS cadastrada. <a href="service_form.html" style="color:var(--primary);font-weight:600;">Criar primeira OS</a>
            </td></tr>`;
            updateStats([]);
            return;
        }
        sorted.forEach(o => {
            const tr = document.createElement('tr');
            tr.dataset.osId = o.id;
            tr.innerHTML = `
                <td data-label="OS #"><strong>#${o.id}</strong></td>
                <td data-label="Cliente">${escHtml(o.clientName || '-')}</td>
                <td data-label="Categoria"><span style="background:var(--primary-light);color:var(--primary-dark);padding:.2rem .6rem;border-radius:4px;font-size:.8rem;font-weight:600;">${escHtml(o.category || '-')}</span></td>
                <td data-label="Data" style="color:var(--text-muted);font-size:.88rem;">${new Date(o.date).toLocaleDateString('pt-BR')}</td>
                <td data-label="Status">${statusBadge(o.status)}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="location.href='service_form.html?id=${o.id}'">Ver OS</button>
                    <button class="btn btn-sm btn-outline" style="color:var(--danger);border-color:var(--danger);"
                        onclick="deleteOS('${o.id}', this)">🗑 Excluir</button>
                </td>`;
            tbody.appendChild(tr);
        });
        updateStats(sorted);
    }

    // deleteOS é definida fora do initDashboard (escopo global)
    // para evitar problemas de closure no celular

    function updateStats(orders) {
        const byStatus = (s) => orders.filter(o => o.status === s).length;
        const el = id => document.getElementById(id);
        if (el('stat-pending'))    el('stat-pending').textContent    = byStatus('pending') + byStatus('awaiting_approval');
        if (el('stat-inprogress')) el('stat-inprogress').textContent = byStatus('approved');
        if (el('stat-completed'))  el('stat-completed').textContent  = byStatus('completed');
    }

    // 0. Sincroniza OS locais para Firebase (recupera OS antigas não enviadas)
    setTimeout(() => syncLocalToFirebase(), 2000);

    // 1. Mostra local imediatamente (resposta rápida)
    renderOrders(LS.getOrders());

    // 2. Busca Firebase e atualiza — Firebase é fonte de verdade para STATUS
    //    (o cliente aprova/recusa pelo Netlify, não pelo computador do técnico)
    if (db) {
        db.collection('orders').get()
            .then(snap => {
                if (snap.empty) return;
                // Reconstrói lista com dados do Firebase (status atualizado pelo cliente)
                const remote = snap.docs.map(d => ({ ...d.data(), _fbDocId: d.id }));
                // Merge: Firebase sobrescreve local (status é atualizado pelo cliente via Netlify)
                // IDs deletados são filtrados — nunca restaurar OS excluídas
                var deletedIds2 = [];
                try { deletedIds2 = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(e) {}
                const local = LS.getOrders();
                const map = {};
                local.forEach(o => { map[String(o.id)] = o; });
                remote.forEach(o => {
                    const id = String(o.id);
                    if (deletedIds2.indexOf(id) === -1) {   // ignora deletados
                        map[id] = { ...(map[id] || {}), ...o };
                    }
                });
                const merged = Object.values(map).filter(o => deletedIds2.indexOf(String(o.id)) === -1);
                LS.saveOrders(merged);
                renderOrders(merged);
            })
            .catch(e => {
                console.warn('Dashboard Firebase sync:', e.message);
                // Se falhar, usa local mesmo
            });
    }
}

// ─── Delete OS (global — acessível pelo onclick inline em qualquer contexto) ─
window.deleteOS = function(osId, btn) {
    // Confirma exclusão
    const orders = LS.getOrders();
    const os = orders.find(function(o) { return String(o.id) === String(osId); });
    const nome = os ? (os.clientName || 'Cliente') : 'OS #' + osId;
    const cat  = os ? (os.category  || '-')        : '-';

    if (!confirm('Excluir OS #' + osId + ' — ' + nome + ' (' + cat + ')?')) return;

    // Feedback visual imediato
    btn.disabled    = true;
    btn.textContent = '⏳';

    // 1. Marca como deletada (impede sync de restaurar)
    var deleted = [];
    try { deleted = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(e) {}
    if (deleted.indexOf(String(osId)) === -1) { deleted.push(String(osId)); }
    localStorage.setItem('rsp_deleted_ids', JSON.stringify(deleted));

    // 2. Remove do localStorage
    var kept = orders.filter(function(o) { return String(o.id) !== String(osId); });
    localStorage.setItem('rsp_orders', JSON.stringify(kept));

    // 3. Remove linha da tabela
    var tr = btn.closest('tr');
    if (tr) {
        tr.style.transition = 'opacity .3s, transform .3s';
        tr.style.opacity    = '0';
        tr.style.transform  = 'translateX(30px)';
        setTimeout(function() {
            tr.remove();
            // Atualiza contadores
            var r = kept;
            var pend = r.filter(function(o){return o.status==='pending'||o.status==='awaiting_approval';}).length;
            var appr = r.filter(function(o){return o.status==='approved';}).length;
            var comp = r.filter(function(o){return o.status==='completed';}).length;
            var ep = document.getElementById('stat-pending');    if(ep) ep.textContent = pend;
            var ea = document.getElementById('stat-inprogress'); if(ea) ea.textContent = appr;
            var ec = document.getElementById('stat-completed');  if(ec) ec.textContent = comp;
            // Tabela vazia
            var tb = document.querySelector('#dashboard-table tbody');
            if (tb && !tb.querySelector('tr[data-os-id]')) {
                tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:#888;"><div style="font-size:2rem;">📋</div>Nenhuma OS cadastrada.</td></tr>';
            }
        }, 350);
    }

    showToast('🗑 OS #' + osId + ' excluída.', 'info');

    // 4. Remove do Firebase em background (não bloqueia nada)
    if (db) {
        db.collection('orders').doc(String(osId)).delete()
            .then(function() { console.log('☁️ OS #' + osId + ' removida do Firebase'); })
            .catch(function(e) { console.warn('Firebase delete:', e.message); });
    }
};


// ═══════════════════════════════════════════════════════════════════════════
// SERVICE FORM
// ═══════════════════════════════════════════════════════════════════════════
async function initServiceForm() {
    const saveBtn      = document.getElementById('btn-save-draft');
    const sendWABtn    = document.getElementById('btn-send-whatsapp');
    const photoInput   = document.getElementById('service-photo');
    const previewGrid  = document.getElementById('photo-preview-container');
    const photoCount   = document.getElementById('photo-count-label');
    const clientSelect = document.getElementById('client-select');

    let currentOSId = generateId();
    let photos = [];
    let isSaving = false;

    // Carrega dropdown
    async function loadClientSelect() {
        if (!clientSelect) return;
        const clients = await loadAllClients();
        while (clientSelect.options.length > 1) clientSelect.remove(1);
        if (!clients.length) {
            const opt = new Option('(Nenhum cliente — vá em Clientes e cadastre)', '');
            opt.disabled = true;
            clientSelect.add(opt);
            return;
        }
        [...clients].sort((a, b) => a.name.localeCompare(b.name, 'pt')).forEach(c => {
            const opt = new Option(c.name, c.phone);
            opt.dataset.phone = c.phone;
            opt.dataset.name  = c.name;
            clientSelect.add(opt);
        });
    }
    await loadClientSelect();

    window.fillClientData = function () {
        const opt = clientSelect?.options[clientSelect.selectedIndex];
        const phoneEl = document.getElementById('client-phone');
        const nameEl  = document.getElementById('client-name');
        if (opt && opt.value) {
            if (phoneEl) phoneEl.value = opt.dataset.phone || opt.value;
            if (nameEl)  nameEl.value  = opt.dataset.name  || opt.text;
        } else {
            if (phoneEl) phoneEl.value = '';
            if (nameEl)  nameEl.value  = '';
        }
    };

    if (photoInput) {
        photoInput.addEventListener('change', e => {
            const files = Array.from(e.target.files);
            const slots = 5 - photos.length;
            if (slots <= 0) { showToast('Máximo de 5 fotos já atingido.', 'error'); photoInput.value = ''; return; }
            files.slice(0, slots).forEach(file => {
                const r = new FileReader();
                r.onload = ev => { photos.push(ev.target.result); renderThumb(ev.target.result); updateCount(); };
                r.readAsDataURL(file);
            });
            photoInput.value = '';
        });
    }

    function renderThumb(b64) {
        const wrap = document.createElement('div'); wrap.className = 'photo-thumb';
        const img  = document.createElement('img');  img.src = b64;
        const btn  = document.createElement('button'); btn.className = 'remove-btn'; btn.type = 'button'; btn.textContent = '✕';
        btn.onclick = () => { wrap.remove(); photos = photos.filter(p => p !== b64); updateCount(); };
        wrap.appendChild(img); wrap.appendChild(btn);
        previewGrid.appendChild(wrap);
    }

    function updateCount() {
        if (!photoCount) return;
        const n = photos.length;
        photoCount.textContent = n ? `${n} foto${n>1?'s':''} selecionada${n>1?'s':''}` : '';
    }

    function getClientName() {
        const h = document.getElementById('client-name');
        return h ? h.value.trim() : '';
    }

    function buildOrder(id, status) {
        const raw = (document.getElementById('service-value').value || '0').replace(/[^\d,.]/g,'').replace(',','.');
        return {
            id,
            clientName:   getClientName() || 'Cliente',
            phone:        (document.getElementById('client-phone').value || '').trim(),
            category:     document.getElementById('service-category').value || '',
            description:  document.getElementById('service-description').value || '',
            value:        parseFloat(raw) || 0,
            photosBase64: photos,
            status,
            date: new Date().toISOString()
        };
    }

    // Modo edição
    const editId = new URLSearchParams(window.location.search).get('id');
    if (editId) {
        currentOSId = parseInt(editId, 10);
        const all = await loadAllOrders();
        const ex  = all.find(o => String(o.id) === String(editId));
        if (ex) {
            document.getElementById('client-phone').value        = ex.phone       || '';
            document.getElementById('service-category').value    = ex.category    || '';
            document.getElementById('service-description').value = ex.description || '';
            const hn = document.getElementById('client-name');
            if (hn) hn.value = ex.clientName || '';
            document.getElementById('service-value').value = (ex.value || 0).toFixed(2).replace('.', ',');

            const ps = ex.photosBase64 || (ex.photoBase64 ? [ex.photoBase64] : []);
            ps.forEach(p => { photos.push(p); renderThumb(p); });
            updateCount();

            const h2 = document.getElementById('page-title');
            if (h2) h2.textContent = `Editar OS #${currentOSId}`;

            if (ex.phone) {
                for (let i = 0; i < clientSelect.options.length; i++) {
                    if (clientSelect.options[i].value === ex.phone) { clientSelect.selectedIndex = i; break; }
                }
            }

            if (ex.status === 'approved') {
                const area = document.querySelector('.btn-area');
                if (area) {
                    const btn = document.createElement('button');
                    btn.type = 'button'; btn.className = 'btn btn-secondary';
                    btn.textContent = '🏁 Marcar como Concluído';
                    btn.onclick = () => {
                        if (isSaving) return;
                        isSaving = true; btn.disabled = true; btn.textContent = '⏳ Salvando...';
                        persistOrder({ ...ex, status: 'completed' });
                        showToast('✅ OS concluída!', 'success');
                        setTimeout(() => location.href = 'index.html', 1200);
                    };
                    area.appendChild(btn);
                }
            }
        }
    }

    // SALVAR RASCUNHO
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (isSaving) return;
            const phone    = document.getElementById('client-phone').value.trim();
            const category = document.getElementById('service-category').value;
            if (!phone) { showToast('⚠️ Selecione um cliente primeiro.', 'error'); return; }
            if (!category || category === 'Selecione...' || category === '') {
                showToast('⚠️ Selecione a categoria do serviço.', 'error'); return;
            }
            isSaving = true;
            saveBtn.disabled = true;
            saveBtn.textContent = '⏳ Salvando...';
            const saved = await persistOrder(buildOrder(currentOSId, 'pending'));
            if (saved) {
                showToast('✅ OS #' + currentOSId + ' salva!', 'success');
            } else {
                showToast('⚠️ OS salva localmente. Verifique as regras do Firebase.', 'error', 6000);
            }
            setTimeout(() => location.href = 'index.html', 1400);
        });
    }

    // ENVIAR WHATSAPP
    if (sendWABtn) {
        sendWABtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (isSaving) return;
            const phone    = document.getElementById('client-phone').value.trim();
            const category = document.getElementById('service-category').value;
            const name     = getClientName();

            if (!phone) { showToast('⚠️ Selecione um cliente antes de enviar.', 'error'); return; }
            if (!category || category === '' || category === 'Selecione...') {
                showToast('⚠️ Selecione a categoria do serviço.', 'error'); return;
            }

            isSaving = true;
            sendWABtn.disabled = true;

            const orderData = buildOrder(currentOSId, 'awaiting_approval');

            // ── Etapa 1: salva localStorage imediatamente ──────────────────
            sendWABtn.textContent = '⏳ Salvando...';
            const orders = LS.getOrders();
            const idx = orders.findIndex(o => String(o.id) === String(currentOSId));
            if (idx >= 0) orders[idx] = orderData; else orders.push(orderData);
            LS.saveOrders(orders);

            // ── Etapa 2: salva no Firebase com retry ───────────────────────
            let firebaseSaved = false;
            if (db) {
                for (let tentativa = 1; tentativa <= 3; tentativa++) {
                    sendWABtn.textContent = '⏳ Enviando para nuvem (' + tentativa + '/3)...';
                    try {
                        await db.collection('orders').doc(String(currentOSId)).set(orderData);
                        firebaseSaved = true;
                        console.log('☁️ OS #' + currentOSId + ' confirmada no Firebase (tentativa ' + tentativa + ')');
                        break;
                    } catch(e) {
                        console.warn('Tentativa ' + tentativa + ' falhou:', e.code, e.message);
                        if (tentativa < 3) await new Promise(r => setTimeout(r, 1500));
                    }
                }
            }

            // ── Etapa 3: verifica se realmente está no Firebase ────────────
            if (firebaseSaved && db) {
                try {
                    const verify = await db.collection('orders').doc(String(currentOSId)).get();
                    if (!verify.exists) {
                        console.warn('⚠️ Verificação pós-save falhou — documento não encontrado');
                        firebaseSaved = false;
                    } else {
                        console.log('✅ Verificação OK — OS confirmada no Firebase');
                    }
                } catch(e) { console.warn('Verificação Firebase:', e.message); }
            }

            if (!firebaseSaved) {
                sendWABtn.disabled = false;
                sendWABtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> Avançar para WhatsApp';
                isSaving = false;
                showToast('❌ Não foi possível salvar na nuvem após 3 tentativas. Verifique sua internet e as regras do Firebase.', 'error', 10000);
                return;
            }

            // ── Etapa 4: salva cliente e monta mensagem ────────────────────
            persistClient({ name: name || 'Cliente', phone, address: '', email: '' });

            const cleanPhone = phone.replace(/\D/g, '');
            const settings   = LS.getSettings();

            let approvalUrl;
            const pubUrl = (settings.publicUrl || '').trim().replace(/\/+$/, '');
            if (pubUrl) {
                approvalUrl = pubUrl + '/quote_approval.html?id=' + currentOSId;
            } else {
                showToast('⚠️ Configure a URL Pública em Configurações!', 'error', 7000);
                const base = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
                approvalUrl = base + '/quote_approval.html?id=' + currentOSId;
            }

            const msgText = '*' + settings.companyName.toUpperCase() + '*' +
                '\nOlá ' + (name || 'Cliente') + '! Segue o orçamento para o serviço de *' + category + '*.' +
                '\n\nToque no link para visualizar e responder:\n👇\n' + approvalUrl;

            sendWABtn.textContent = '✅ Abrindo WhatsApp...';
            window.open('https://wa.me/55' + cleanPhone + '?text=' + encodeURIComponent(msgText), '_blank');
            showToast('✅ OS salva na nuvem! Abrindo WhatsApp...', 'success');
            setTimeout(() => location.href = 'index.html', 1500);
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTES PAGE — localStorage como fonte de verdade, sem onSnapshot
// ═══════════════════════════════════════════════════════════════════════════
async function initClientsPage() {
    const form  = document.getElementById('client-form');
    const tbody = document.querySelector('#clients-table tbody');

    function renderTable(clients) {
        if (!tbody) return;
        tbody.innerHTML = '';
        const label = document.getElementById('client-count-label');

        if (!clients || !clients.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--text-muted);">Nenhum cliente cadastrado.</td></tr>';
            if (label) label.textContent = '';
            return;
        }

        const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
        if (label) label.textContent = `${sorted.length} cliente${sorted.length > 1 ? 's' : ''} cadastrado${sorted.length > 1 ? 's' : ''}`;

        sorted.forEach((c, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Nome"><strong>${escHtml(c.name)}</strong></td>
                <td data-label="WhatsApp"><a href="https://wa.me/55${(c.phone||'').replace(/\D/g,'')}" target="_blank"
                    style="color:var(--whatsapp);text-decoration:none;font-weight:500;">📱 ${escHtml(c.phone)}</a></td>
                <td data-label="Endereço" style="color:var(--text-muted);font-size:.88rem;">${escHtml(c.address || '-')}</td>
                <td style="color:var(--text-muted);font-size:.88rem;">${escHtml(c.email   || '-')}</td>
                <td><button class="btn btn-sm btn-outline" style="color:var(--danger);border-color:var(--danger);"
                    onclick="deleteClientByIndex(${i})">Excluir</button></td>`;
            tbody.appendChild(tr);
        });
    }

    // Carrega local primeiro — imediato
    renderTable(LS.getClients());

    // Depois tenta merge com Firebase (só leitura, não substitui local)
    loadAllClients().then(merged => {
        renderTable(merged);
    });

    // SEM onSnapshot — evita sobrescrever dados locais frescos
    // Firebase é sync apenas no save, não precisa de listener aqui

    window.deleteClientByIndex = function (index) {
        const sorted = [...LS.getClients()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
        const c = sorted[index];
        if (!c || !confirm(`Excluir o cliente "${c.name}"?`)) return;

        const all = LS.getClients();
        const i2  = all.findIndex(x => x.phone === c.phone);
        if (i2 >= 0) { all.splice(i2, 1); LS.saveClients(all); }
        renderTable(LS.getClients());

        if (db && c._fbDocId) {
            db.collection('clients').doc(c._fbDocId).delete()
                .catch(e => console.warn('Firebase delete:', e.message));
        }
        showToast(`Cliente "${c.name}" removido.`, 'info');
    };

    if (!form) return;

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        if (btn.disabled) return;

        const name    = (document.getElementById('new-client-name').value    || '').trim();
        const phone   = (document.getElementById('new-client-phone').value   || '').trim();
        const address = (document.getElementById('new-client-address').value || '').trim();
        const email   = (document.getElementById('new-client-email').value   || '').trim();

        if (!name)  { showToast('⚠️ Informe o nome do cliente.', 'error'); return; }
        if (!phone) { showToast('⚠️ Informe o WhatsApp do cliente.', 'error'); return; }

        const dup = LS.getClients().find(c => c.phone === phone);
        if (dup)    { showToast(`Já existe um cliente com este número: ${dup.name}`, 'error'); return; }

        btn.disabled = true;
        btn.textContent = '⏳ Salvando...';

        const clientData = { name, phone, address, email };

        // Salva LOCAL — imediato e confiável
        const clients = LS.getClients();
        clients.push(clientData);
        LS.saveClients(clients);

        // Renderiza imediatamente com os dados do LS (fonte de verdade)
        renderTable(LS.getClients());

        // Firebase background — não trava a UI
        if (db) {
            db.collection('clients').add(clientData)
                .then(() => console.log('☁️ Cliente Firebase:', name))
                .catch(err => console.warn('Firebase client:', err.message));
        }

        showToast(`✅ Cliente "${name}" cadastrado!`, 'success');
        form.reset();
        btn.disabled = false;
        btn.textContent = 'Salvar Cliente';
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════
async function initReports() {
    function fmtVal(v) {
        return 'R$ ' + (v || 0).toFixed(2).replace('.', ',');
    }
    function fmtDate(d) {
        if (!d) return '-';
        return new Date(d).toLocaleDateString('pt-BR');
    }

    function osItemHTML(o) {
        return `<div class="os-item">
            <div class="os-item-left">
                <span class="os-id">OS #${o.id} · ${fmtDate(o.date)}</span>
                <span class="os-name">${escHtml(o.clientName || 'Cliente')}</span>
                <span class="os-cat">${escHtml(o.category || '-')}</span>
                ${o.description ? `<span style="font-size:.78rem;color:var(--text-muted);margin-top:.1rem;">${escHtml(o.description.substring(0,80))}${o.description.length>80?'…':''}</span>` : ''}
            </div>
            <div class="os-item-right">
                <div class="os-value">${fmtVal(o.value)}</div>
                <div class="os-date">${statusBadge(o.status)}</div>
                <div style="margin-top:.4rem;">
                    <a href="service_form.html?id=${o.id}" class="btn btn-sm btn-outline"
                       onclick="event.stopPropagation()" style="font-size:.72rem;padding:.25rem .6rem;">Ver OS</a>
                </div>
            </div>
        </div>`;
    }

    function render(orders) {
        const el = id => document.getElementById(id);

        // ── Cálculos ──
        const revenueOrders  = orders.filter(o => o.status === 'completed' || o.status === 'approved');
        const approvedOrders = orders.filter(o => o.status === 'completed' || o.status === 'approved');
        const rejectedOrders = orders.filter(o => o.status === 'rejected');
        const revenue  = revenueOrders.reduce((s, o) => s + (o.value || 0), 0);
        const approved = approvedOrders.length;
        const rejected = rejectedOrders.length;
        const total    = approved + rejected;
        const convPct  = total ? ((approved / total) * 100).toFixed(1) : '0';

        // ── Cabeçalhos ──
        if (el('report-revenue'))    el('report-revenue').textContent    = fmtVal(revenue);
        if (el('report-approved'))   el('report-approved').textContent   = approved;
        if (el('report-rejected'))   el('report-rejected').textContent   = rejected;
        if (el('report-conversion')) el('report-conversion').textContent = convPct + '%';

        // ── Painel Faturamento ──
        if (el('detail-revenue')) {
            if (!revenueOrders.length) {
                el('detail-revenue').innerHTML = '<div class="panel-empty">Nenhuma OS aprovada ou concluída ainda.</div>';
            } else {
                const sorted = [...revenueOrders].sort((a,b) => (b.value||0)-(a.value||0));
                el('detail-revenue').innerHTML =
                    sorted.map(osItemHTML).join('') +
                    `<div class="panel-total">
                        <span>Total (${sorted.length} OS)</span>
                        <span style="color:var(--secondary);">${fmtVal(revenue)}</span>
                    </div>`;
            }
        }

        // ── Painel Aprovadas ──
        if (el('detail-approved')) {
            if (!approvedOrders.length) {
                el('detail-approved').innerHTML = '<div class="panel-empty">Nenhuma OS aprovada ainda.</div>';
            } else {
                const sorted = [...approvedOrders].sort((a,b) => new Date(b.date)-new Date(a.date));
                el('detail-approved').innerHTML =
                    sorted.map(osItemHTML).join('') +
                    `<div class="panel-total">
                        <span>${sorted.length} OS aprovada${sorted.length>1?'s':''}</span>
                        <span style="color:var(--success);">${fmtVal(revenue)}</span>
                    </div>`;
            }
        }

        // ── Painel Recusadas ──
        if (el('detail-rejected')) {
            if (!rejectedOrders.length) {
                el('detail-rejected').innerHTML = '<div class="panel-empty">Nenhuma OS recusada. 🎉</div>';
            } else {
                const sorted = [...rejectedOrders].sort((a,b) => new Date(b.date)-new Date(a.date));
                const valorPerdido = sorted.reduce((s,o) => s+(o.value||0), 0);
                el('detail-rejected').innerHTML =
                    sorted.map(osItemHTML).join('') +
                    `<div class="panel-total">
                        <span>${sorted.length} OS recusada${sorted.length>1?'s':''}</span>
                        <span style="color:var(--danger);">Perdido: ${fmtVal(valorPerdido)}</span>
                    </div>`;
            }
        }

        // ── Painel Conversão ──
        if (el('detail-conversion')) {
            const pendentes = orders.filter(o => o.status === 'pending' || o.status === 'awaiting_approval');
            el('detail-conversion').innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:1.25rem;">
                    <div style="text-align:center;padding:.75rem;background:var(--success-bg);border-radius:var(--radius);border:1px solid #c8e6c9;">
                        <div style="font-size:1.6rem;font-weight:700;color:var(--success);">${approved}</div>
                        <div style="font-size:.68rem;color:var(--success);font-weight:600;text-transform:uppercase;">Aprovadas</div>
                    </div>
                    <div style="text-align:center;padding:.75rem;background:var(--danger-bg);border-radius:var(--radius);border:1px solid #ffcdd2;">
                        <div style="font-size:1.6rem;font-weight:700;color:var(--danger);">${rejected}</div>
                        <div style="font-size:.68rem;color:var(--danger);font-weight:600;text-transform:uppercase;">Recusadas</div>
                    </div>
                    <div style="text-align:center;padding:.75rem;background:var(--warning-bg);border-radius:var(--radius);border:1px solid #ffe0b2;">
                        <div style="font-size:1.6rem;font-weight:700;color:var(--warning);">${pendentes.length}</div>
                        <div style="font-size:.68rem;color:var(--warning);font-weight:600;text-transform:uppercase;">Pendentes</div>
                    </div>
                </div>
                <div style="background:var(--surface);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:.5rem;font-size:.82rem;font-weight:600;">
                        <span style="color:var(--success);">Aprovadas</span>
                        <span>${convPct}%</span>
                    </div>
                    <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
                        <div style="height:100%;width:${convPct}%;background:linear-gradient(90deg,var(--success),#4caf50);border-radius:5px;transition:width .6s ease;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:.5rem;font-size:.75rem;color:var(--text-muted);">
                        <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                </div>
                ${total === 0 ? '<div class="panel-empty">Sem dados suficientes para calcular conversão.</div>' :
                  `<div style="font-size:.82rem;color:var(--text-secondary);line-height:1.7;">
                    📊 De <strong>${total}</strong> orçamentos respondidos, <strong>${approved}</strong> foram aprovados.<br>
                    💰 Faturamento gerado: <strong style="color:var(--secondary);">${fmtVal(revenue)}</strong><br>
                    ${valorPerdidoTotal > 0 ? `❌ Valor perdido em recusas: <strong style="color:var(--danger);">${fmtVal(valorPerdidoTotal)}</strong>` : ''}
                  </div>`
                }`;

            // Corrige referência de valor perdido
            var valorPerdidoTotal = rejectedOrders.reduce((s,o)=>s+(o.value||0),0);
            if (el('detail-conversion')) {
                el('detail-conversion').innerHTML = el('detail-conversion').innerHTML
                    .replace('valorPerdidoTotal', valorPerdidoTotal);
            }
        }

        // ── Categorias ──
        const cats = {};
        orders.forEach(o => {
            if (o.category && o.category !== 'Selecione...' && o.category !== '') {
                if (!cats[o.category]) cats[o.category] = { total:0, approved:0, revenue:0 };
                cats[o.category].total++;
                if (o.status === 'approved' || o.status === 'completed') {
                    cats[o.category].approved++;
                    cats[o.category].revenue += (o.value||0);
                }
            }
        });
        const catEl = el('categories-detail');
        if (catEl) {
            const entries = Object.entries(cats).sort((a,b) => b[1].total - a[1].total);
            const maxCount = entries.length ? entries[0][1].total : 1;
            if (!entries.length) {
                catEl.innerHTML = '<div class="panel-empty">Nenhum dado ainda.</div>';
            } else {
                catEl.innerHTML = entries.map(([cat, data]) => `
                    <div class="cat-row">
                        <span style="font-weight:600;font-size:.88rem;min-width:90px;">${escHtml(cat)}</span>
                        <div class="cat-bar-wrap">
                            <div class="cat-bar" style="width:${Math.round((data.total/maxCount)*100)}%;"></div>
                        </div>
                        <div style="text-align:right;min-width:80px;">
                            <span class="cat-count">${data.total}</span>
                            <div style="font-size:.68rem;color:var(--text-muted);">${fmtVal(data.revenue)}</div>
                        </div>
                    </div>`).join('');
            }
        }
    }

    render(LS.getOrders());
    loadAllOrders().then(render);
}

window.exportReportToPDF = async function () {
    // Verifica se html2pdf foi carregado
    if (typeof html2pdf === 'undefined') {
        showToast('❌ Biblioteca de PDF não carregou. Verifique sua conexão e tente novamente.', 'error', 5000);
        return;
    }

    const btn = document.getElementById('btn-export-pdf');
    const el  = document.getElementById('pdf-content');
    const hdr = document.getElementById('pdf-header');
    const navbar = document.querySelector('.navbar');

    if (!el) { showToast('❌ Conteúdo não encontrado.', 'error'); return; }

    // Feedback no botão
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando PDF...'; }

    // Exibe cabeçalho e esconde navbar no PDF
    if (hdr) hdr.style.display = 'block';
    if (navbar) navbar.style.display = 'none';

    const settings = LS.getSettings();
    const company  = document.getElementById('pdf-header')?.querySelector('h1');
    if (company) company.textContent = settings.companyName || 'RSP PRESTAÇÃO DE SERVIÇOS';

    const filename = 'Relatorio_RSP_' + new Date().toISOString().split('T')[0] + '.pdf';

    try {
        await html2pdf().set({
            margin:      [0.5, 0.5, 0.5, 0.5],
            filename:    filename,
            image:       { type: 'jpeg', quality: 0.97 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF:       { unit: 'in', format: 'a4', orientation: 'portrait' }
        }).from(el).save();

        showToast('✅ PDF exportado com sucesso!', 'success');
    } catch(e) {
        console.error('PDF error:', e);
        showToast('❌ Erro ao gerar PDF: ' + e.message, 'error', 6000);
    } finally {
        // Restaura estado da página
        if (hdr)    hdr.style.display    = 'none';
        if (navbar) navbar.style.display = '';
        if (btn) { btn.disabled = false; btn.textContent = '📄 Exportar PDF'; }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════
function initConfigPage() {
    const form = document.getElementById('config-form');
    if (!form) return;
    const s = LS.getSettings();
    document.getElementById('config-company-name').value = s.companyName;
    document.getElementById('config-owner').value        = s.owner;
    document.getElementById('config-phone').value        = s.phone;
    const pubEl = document.getElementById('config-public-url');
    if (pubEl) pubEl.value = s.publicUrl || '';

    form.addEventListener('submit', e => {
        e.preventDefault();
        const pubUrl = document.getElementById('config-public-url');
        LS.saveSettings({
            companyName: document.getElementById('config-company-name').value.trim(),
            owner:       document.getElementById('config-owner').value.trim(),
            phone:       document.getElementById('config-phone').value.trim(),
            publicUrl:   pubUrl ? pubUrl.value.trim() : '',
        });
        showToast('✅ Configurações salvas!', 'success');
    });
}

// ─── Exports para quote_approval.html ─────────────────────────────────────
window._rspDB        = () => db;
window._rspLS        = LS;
window._loadOrders   = loadAllOrders;
window._persistOrder = persistOrder;
window.showToast     = showToast;
