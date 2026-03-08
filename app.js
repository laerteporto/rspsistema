// app.js - RSP System v2 — Firebase é a FONTE DE VERDADE
// localStorage é cache local. Firebase sempre prevalece no merge.

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

// ─── Sincronização Bidirecional: Firebase ↔ localStorage ─────────────────
// Firebase sempre prevalece. Dados locais exclusivos sobem para a nuvem.
async function syncLocalToFirebase() {
    if (!db) return { synced: 0, failed: 0, pulled: 0 };

    var deletedIds = [];
    try { deletedIds = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(e) {}

    let synced = 0, failed = 0, pulled = 0;

    try {
        // 1. Busca tudo do Firebase
        const snap = await db.collection('orders').get();
        const remote = snap.docs.map(d => d.data());
        const remoteMap = {};
        remote.forEach(o => { remoteMap[String(o.id)] = o; });

        // 2. OS locais que não estão no Firebase → sobe (exceto deletadas)
        const local = LS.getOrders();
        for (const order of local) {
            const id = String(order.id);
            if (deletedIds.indexOf(id) !== -1) continue;
            if (!remoteMap[id]) {
                try {
                    await db.collection('orders').doc(id).set(order);
                    synced++;
                    console.log('⬆️ OS #' + id + ' enviada ao Firebase');
                } catch(e) {
                    failed++;
                    console.warn('⬆️ Falha OS #' + id + ':', e.message);
                }
            }
        }

        // 3. Firebase → atualiza cache local (Firebase prevalece)
        const localMap = {};
        local.forEach(o => { localMap[String(o.id)] = o; });
        for (const o of remote) {
            const id = String(o.id);
            if (deletedIds.indexOf(id) !== -1) continue;
            if (!localMap[id] || JSON.stringify(localMap[id]) !== JSON.stringify(o)) {
                localMap[id] = o;
                pulled++;
            }
        }

        // 4. Remove excluídas do cache local
        const finalOrders = Object.values(localMap)
            .filter(o => deletedIds.indexOf(String(o.id)) === -1);
        LS.saveOrders(finalOrders);

        if (pulled > 0) console.log('⬇️ ' + pulled + ' OS(s) atualizadas do Firebase');

    } catch(e) {
        failed++;
        console.warn('Sync bidirecional falhou:', e.message);
    }

    return { synced, failed, pulled };
}

// Botão "Sincronizar" no dashboard — força sync completo e re-renderiza
window.forceSyncAll = async function() {
    const btn = document.getElementById('btn-sync');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Sincronizando...'; }

    if (!db) {
        showToast('❌ Firebase não conectado. Verifique sua internet.', 'error', 6000);
        if (btn) { btn.disabled = false; btn.innerHTML = '☁️ Sincronizar'; }
        return;
    }

    try {
        showToast('🔄 Buscando dados da nuvem...', 'info', 3000);
        const result = await syncLocalToFirebase();

        // Re-renderiza o dashboard com dados frescos do Firebase
        const freshOrders = await loadAllOrders();
        if (window._dashboardRender) window._dashboardRender(freshOrders);

        const total = result.synced + result.pulled;
        if (result.failed > 0) {
            showToast('⚠️ ' + result.failed + ' item(ns) falharam. Verifique a internet.', 'error', 6000);
        } else if (total === 0) {
            showToast('✅ Tudo sincronizado! Dados já estão atualizados.', 'success', 4000);
        } else {
            showToast('✅ Sincronizado! ⬆️' + result.synced + ' enviadas · ⬇️' + result.pulled + ' atualizadas', 'success', 5000);
        }
    } catch(e) {
        showToast('❌ Erro: ' + e.message, 'error', 6000);
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '☁️ Sincronizar'; }
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

// ─── LocalStorage — CACHE LOCAL (Firebase prevalece no merge) ───────────────
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

// ─── Load Orders: Firebase é a fonte de verdade ───────────────────────────
async function loadAllOrders() {
    const local = LS.getOrders();
    if (!db) {
        console.warn('⚠️ Firebase indisponível — usando cache local');
        return local;
    }
    try {
        const snap = await db.collection('orders').get();
        if (snap.empty) {
            // Firebase vazio: sobe os dados locais para a nuvem
            if (local.length > 0) {
                console.log('☁️ Firebase vazio — enviando dados locais...');
                for (const o of local) {
                    try { await db.collection('orders').doc(String(o.id)).set(o); } catch(_) {}
                }
            }
            return local;
        }

        // Firebase tem dados: ele prevalece
        const remote = snap.docs.map(d => ({ ...d.data() }));

        // Lê lista negra para não restaurar OS excluídas
        let deletedIds = [];
        try { deletedIds = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(_) {}

        // Merge: Firebase prevalece; apenas OS locais NOVAS (não existem no Firebase)
        // que não estejam na lista negra são adicionadas ao Firebase
        const remoteMap = {};
        remote.forEach(o => { remoteMap[String(o.id)] = o; });

        const onlyLocal = local.filter(o =>
            !remoteMap[String(o.id)] &&
            deletedIds.indexOf(String(o.id)) === -1
        );

        // Envia OS locais novas ao Firebase em background
        if (onlyLocal.length > 0) {
            console.log('☁️ Enviando ' + onlyLocal.length + ' OS local(is) para Firebase...');
            for (const o of onlyLocal) {
                try { await db.collection('orders').doc(String(o.id)).set(o); remote.push(o); }
                catch(e) { console.warn('Upload OS #' + o.id + ':', e.message); }
            }
        }

        // Filtra excluídas do resultado final
        const merged = remote.filter(o => deletedIds.indexOf(String(o.id)) === -1);

        // Atualiza cache local com dados do Firebase
        LS.saveOrders(merged);
        console.log('✅ Sincronizado: ' + merged.length + ' OS do Firebase');
        return merged;
    } catch (e) {
        console.warn('⚠️ Firebase loadOrders falhou — usando cache local:', e.message);
        return local;
    }
}

// ─── Load Clients: Firebase é a fonte de verdade ──────────────────────────
async function loadAllClients() {
    const local = LS.getClients();
    if (!db) return local;
    try {
        const snap = await db.collection('clients').get();
        if (snap.empty) {
            // Firebase vazio: sobe clientes locais
            for (const c of local) {
                try { await db.collection('clients').add(c); } catch(_) {}
            }
            return local;
        }

        const remote = snap.docs.map(d => ({ ...d.data(), _fbDocId: d.id }));

        // Clientes apenas locais → sobe ao Firebase
        const remotePhones = new Set(remote.map(c => c.phone));
        const onlyLocal = local.filter(c => !remotePhones.has(c.phone));
        for (const c of onlyLocal) {
            try { await db.collection('clients').add(c); remote.push(c); }
            catch(e) { console.warn('Upload client:', e.message); }
        }

        // Firebase prevalece
        LS.saveClients(remote);
        return remote;
    } catch (e) {
        console.warn('⚠️ Firebase loadClients falhou:', e.message);
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

    window._dashboardRender = renderOrders;
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

    // 1. Mostra cache local imediatamente (resposta visual rápida)
    renderOrders(LS.getOrders());

    // 2. onSnapshot — escuta mudanças em tempo real no Firebase
    //    Qualquer alteração em QUALQUER dispositivo (excluir, aprovar, criar)
    //    é refletida automaticamente em todos os outros dispositivos abertos
    if (db) {
        db.collection('orders').onSnapshot(snap => {
            var deletedIds = [];
            try { deletedIds = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(e) {}

            // Reconstrói lista completa do Firebase, ignorando OS excluídas localmente
            const fromFirebase = snap.docs
                .map(d => d.data())
                .filter(o => deletedIds.indexOf(String(o.id)) === -1);

            // Atualiza cache local com dados do Firebase
            LS.saveOrders(fromFirebase);

            // Re-renderiza o dashboard
            renderOrders(fromFirebase);
            console.log('🔴 onSnapshot: ' + fromFirebase.length + ' OS do Firebase');
        }, err => {
            console.warn('⚠️ onSnapshot erro:', err.message);
            // Fallback: busca única sem tempo real
            db.collection('orders').get().then(snap => {
                const orders = snap.docs.map(d => d.data());
                LS.saveOrders(orders);
                renderOrders(orders);
            }).catch(() => {});
        });
    } else {
        // Sem Firebase: usa local e tenta reconectar
        setTimeout(() => {
            if (db) db.collection('orders').onSnapshot(snap => {
                const orders = snap.docs.map(d => d.data());
                LS.saveOrders(orders);
                renderOrders(orders);
            });
        }, 3000);
    }

    // 3. Sincroniza OS locais órfãs para o Firebase em background
    setTimeout(() => syncLocalToFirebase(), 2500);
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

    // 4. Remove do Firebase — isso dispara o onSnapshot em TODOS os dispositivos
    //    automaticamente, fazendo o dashboard atualizar em tempo real no PC e celular
    if (db) {
        var MAX_TRIES = 3, attempt = 0;
        function tryDelete() {
            attempt++;
            db.collection('orders').doc(String(osId)).delete()
                .then(function() {
                    console.log('☁️ OS #' + osId + ' removida do Firebase (tentativa ' + attempt + ')');
                })
                .catch(function(e) {
                    console.warn('Firebase delete tentativa ' + attempt + ':', e.message);
                    if (attempt < MAX_TRIES) {
                        setTimeout(tryDelete, 2000 * attempt); // retry com backoff
                    } else {
                        console.error('❌ Falha ao remover OS #' + osId + ' do Firebase após ' + MAX_TRIES + ' tentativas');
                        showToast('⚠️ OS removida localmente. Sincronize para remover da nuvem.', 'error', 6000);
                    }
                });
        }
        tryDelete();
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
            const valorPerdidoTotal = rejectedOrders.reduce((s,o) => s+(o.value||0), 0);

            el('detail-conversion').innerHTML = `
                <!-- 3 contadores empilhados verticalmente — sem corte em qualquer tela -->
                <div style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:1.25rem;">

                    <div style="display:flex;align-items:center;justify-content:space-between;
                                padding:.75rem 1rem;background:var(--success-bg);
                                border-radius:var(--radius);border:1px solid #c8e6c9;">
                        <div style="display:flex;align-items:center;gap:.6rem;">
                            <span style="font-size:1.3rem;">✅</span>
                            <span style="font-size:.8rem;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:.5px;">Aprovadas</span>
                        </div>
                        <span style="font-size:1.8rem;font-weight:800;color:var(--success);line-height:1;">${approved}</span>
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;
                                padding:.75rem 1rem;background:var(--danger-bg);
                                border-radius:var(--radius);border:1px solid #ffcdd2;">
                        <div style="display:flex;align-items:center;gap:.6rem;">
                            <span style="font-size:1.3rem;">❌</span>
                            <span style="font-size:.8rem;font-weight:700;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;">Recusadas</span>
                        </div>
                        <span style="font-size:1.8rem;font-weight:800;color:var(--danger);line-height:1;">${rejected}</span>
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;
                                padding:.75rem 1rem;background:var(--warning-bg);
                                border-radius:var(--radius);border:1px solid #ffe0b2;">
                        <div style="display:flex;align-items:center;gap:.6rem;">
                            <span style="font-size:1.3rem;">⏳</span>
                            <span style="font-size:.8rem;font-weight:700;color:var(--warning);text-transform:uppercase;letter-spacing:.5px;">Pendentes</span>
                        </div>
                        <span style="font-size:1.8rem;font-weight:800;color:var(--warning);line-height:1;">${pendentes.length}</span>
                    </div>

                </div>

                <!-- Barra de progresso -->
                <div style="background:var(--surface);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;border:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">
                        <span style="font-size:.82rem;font-weight:700;color:var(--success);">Taxa de aprovação</span>
                        <span style="font-size:1.1rem;font-weight:800;color:var(--primary);">${convPct}%</span>
                    </div>
                    <div style="height:12px;background:var(--border);border-radius:6px;overflow:hidden;">
                        <div style="height:100%;width:${convPct}%;
                             background:linear-gradient(90deg,var(--success),#66bb6a);
                             border-radius:6px;transition:width .6s ease;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:.4rem;font-size:.7rem;color:var(--text-muted);">
                        <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                </div>

                <!-- Resumo textual -->
                ${total === 0
                    ? '<div class="panel-empty">Sem dados suficientes ainda.</div>'
                    : `<div style="font-size:.84rem;color:var(--text-secondary);line-height:2;background:var(--surface);
                                  padding:.85rem 1rem;border-radius:var(--radius);border:1px solid var(--border);">
                        📊 <strong>${total}</strong> orçamentos respondidos<br>
                        ✅ <strong>${approved}</strong> aprovados &nbsp;|&nbsp; ❌ <strong>${rejected}</strong> recusados<br>
                        💰 Faturamento: <strong style="color:var(--secondary);">${fmtVal(revenue)}</strong><br>
                        ${valorPerdidoTotal > 0 ? `❌ Valor perdido: <strong style="color:var(--danger);">${fmtVal(valorPerdidoTotal)}</strong>` : '🎯 Sem valor perdido em recusas!'}
                       </div>`
                }`;
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

    // Escuta mudanças em tempo real (excluir OS no celular atualiza relatórios no PC)
    if (db) {
        db.collection('orders').onSnapshot(snap => {
            var deletedIds = [];
            try { deletedIds = JSON.parse(localStorage.getItem('rsp_deleted_ids')) || []; } catch(e) {}
            const orders = snap.docs.map(d => d.data())
                .filter(o => deletedIds.indexOf(String(o.id)) === -1);
            LS.saveOrders(orders);
            render(orders);
        }, () => {});
    }
}

window.exportReportToPDF = async function () {
    if (typeof html2pdf === 'undefined') {
        showToast('❌ Biblioteca de PDF não carregou.', 'error', 5000);
        return;
    }
    const btn = document.getElementById('btn-export-pdf');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando PDF...'; }

    try {
        const orders   = await loadAllOrders();
        const settings = LS.getSettings();

        // ── Helpers ──────────────────────────────────────────────────────────
        function fv(v)  { return 'R$ ' + (v||0).toFixed(2).replace('.',','); }
        function fd(d)  { return d ? new Date(d).toLocaleDateString('pt-BR') : '-'; }
        function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        function statusLabel(s) {
            const m = { pending:'Pendente', awaiting_approval:'Aguardando', approved:'Aprovado', rejected:'Recusado', completed:'Concluído' };
            return m[s] || s;
        }
        function statusColor(s) {
            const m = { approved:'#2e7d32', completed:'#1565c0', rejected:'#c62828', pending:'#e65100', awaiting_approval:'#e65100' };
            return m[s] || '#555';
        }

        // ── Cálculos ─────────────────────────────────────────────────────────
        const revenueOrders  = orders.filter(o => o.status==='completed' || o.status==='approved');
        const approvedOrders = revenueOrders;
        const rejectedOrders = orders.filter(o => o.status==='rejected');
        const pendOrders     = orders.filter(o => o.status==='pending' || o.status==='awaiting_approval');
        const revenue        = revenueOrders.reduce((s,o)=>s+(o.value||0),0);
        const valorPerdido   = rejectedOrders.reduce((s,o)=>s+(o.value||0),0);
        const approved       = approvedOrders.length;
        const rejected       = rejectedOrders.length;
        const total          = approved + rejected;
        const convPct        = total ? ((approved/total)*100).toFixed(1) : '0.0';

        // ── Categorias ───────────────────────────────────────────────────────
        const cats = {};
        orders.forEach(o => {
            if (!o.category || o.category==='Selecione...') return;
            if (!cats[o.category]) cats[o.category] = { total:0, approved:0, rejected:0, revenue:0, perdido:0 };
            cats[o.category].total++;
            if (o.status==='approved'||o.status==='completed') { cats[o.category].approved++; cats[o.category].revenue+=(o.value||0); }
            if (o.status==='rejected') { cats[o.category].rejected++; cats[o.category].perdido+=(o.value||0); }
        });
        const catEntries = Object.entries(cats).sort((a,b)=>b[1].total-a[1].total);

        // ── Linha de OS para tabelas ──────────────────────────────────────────
        function osRow(o, rowBg) {
            return `<tr style="background:${rowBg};">
                <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:700;color:#333;white-space:nowrap;">#${o.id}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #eee;">${esc(o.clientName||'Cliente')}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #eee;color:#888;font-size:.82em;">${esc(o.category||'-')}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #eee;color:#888;font-size:.82em;">${fd(o.date)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:.8em;color:${statusColor(o.status)};font-weight:700;">${statusLabel(o.status)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#7b3e19;">${fv(o.value)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:.75em;color:#888;max-width:150px;">${esc((o.description||'').substring(0,60))}${(o.description||'').length>60?'…':''}</td>
            </tr>`;
        }

        function osTable(list, emptyMsg) {
            if (!list.length) return `<p style="color:#888;font-style:italic;padding:8px 0;">${emptyMsg}</p>`;
            const rows = list.sort((a,b)=>new Date(b.date)-new Date(a.date))
                .map((o,i)=>osRow(o, i%2===0?'#fff':'#fafaf8')).join('');
            return `<table style="width:100%;border-collapse:collapse;font-size:.85em;">
                <thead><tr style="background:#f5f0eb;">
                    <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">OS #</th>
                    <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">Cliente</th>
                    <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">Categoria</th>
                    <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">Data</th>
                    <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">Status</th>
                    <th style="padding:7px 10px;text-align:right;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">Valor</th>
                    <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e0da;">Descrição</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

        function section(title, color, content) {
            return `<div style="margin-bottom:28px;page-break-inside:avoid;">
                <div style="background:${color}18;border-left:4px solid ${color};padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:10px;">
                    <h3 style="margin:0;color:${color};font-size:1em;font-family:sans-serif;">${title}</h3>
                </div>
                ${content}
            </div>`;
        }

        // ── HTML do PDF ───────────────────────────────────────────────────────
        const html = `
        <div style="font-family:'DM Sans',Arial,sans-serif;color:#1a1814;padding:20px;max-width:750px;margin:0 auto;">

            <!-- Cabeçalho -->
            <div style="text-align:center;padding-bottom:20px;border-bottom:3px solid #d36e2d;margin-bottom:24px;">
                <h1 style="margin:0;font-size:1.5em;color:#d36e2d;text-transform:uppercase;letter-spacing:2px;">${esc(settings.companyName||'RSP PRESTAÇÃO DE SERVIÇOS')}</h1>
                <p style="margin:4px 0 0;color:#7b3e19;font-weight:600;">Relatório Completo de Desempenho</p>
                <p style="margin:4px 0 0;font-size:.82em;color:#9a958e;">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p>
            </div>

            <!-- Resumo executivo -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:28px;">
                <div style="background:#fff8f3;border:1px solid #f5e6d8;border-radius:10px;padding:14px;text-align:center;">
                    <div style="font-size:.65em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Faturamento</div>
                    <div style="font-size:1.1em;font-weight:800;color:#7b3e19;">${fv(revenue)}</div>
                </div>
                <div style="background:#f1f8f2;border:1px solid #c8e6c9;border-radius:10px;padding:14px;text-align:center;">
                    <div style="font-size:.65em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Aprovadas</div>
                    <div style="font-size:1.5em;font-weight:800;color:#2e7d32;">${approved}</div>
                </div>
                <div style="background:#fff5f5;border:1px solid #ffcdd2;border-radius:10px;padding:14px;text-align:center;">
                    <div style="font-size:.65em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Recusadas</div>
                    <div style="font-size:1.5em;font-weight:800;color:#c62828;">${rejected}</div>
                </div>
                <div style="background:#fff8e1;border:1px solid #ffe0b2;border-radius:10px;padding:14px;text-align:center;">
                    <div style="font-size:.65em;color:#9a958e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Conversão</div>
                    <div style="font-size:1.3em;font-weight:800;color:#d36e2d;">${convPct}%</div>
                </div>
            </div>

            <!-- 1. Faturamento -->
            ${section('💰 Faturamento — OS Aprovadas e Concluídas (' + approved + ' OS · ' + fv(revenue) + ')', '#2e7d32',
                osTable(approvedOrders, 'Nenhuma OS aprovada ainda.')
                + (approved > 0 ? `<div style="text-align:right;padding:8px 10px;background:#f1f8f2;border-radius:6px;margin-top:4px;font-weight:700;color:#2e7d32;">Total: ${fv(revenue)}</div>` : '')
            )}

            <!-- 2. Recusadas -->
            ${section('❌ OS Recusadas (' + rejected + ' OS · Perdido: ' + fv(valorPerdido) + ')', '#c62828',
                osTable(rejectedOrders, 'Nenhuma OS recusada. 🎉')
                + (rejected > 0 ? `<div style="text-align:right;padding:8px 10px;background:#fff5f5;border-radius:6px;margin-top:4px;font-weight:700;color:#c62828;">Valor total perdido: ${fv(valorPerdido)}</div>` : '')
            )}

            <!-- 3. Pendentes -->
            ${section('⏳ OS Pendentes / Aguardando Resposta (' + pendOrders.length + ')', '#e65100',
                osTable(pendOrders, 'Nenhuma OS pendente.')
            )}

            <!-- 4. Todas as OS -->
            ${section('📋 Todas as Ordens de Serviço (' + orders.length + ' no total)', '#1565c0',
                osTable(orders, 'Nenhuma OS cadastrada.')
            )}

            <!-- 5. Categorias -->
            <div style="margin-bottom:28px;page-break-inside:avoid;">
                <div style="background:#f5f0eb;border-left:4px solid #d36e2d;padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:10px;">
                    <h3 style="margin:0;color:#d36e2d;font-size:1em;font-family:sans-serif;">📊 Serviços por Categoria</h3>
                </div>
                ${catEntries.length === 0
                    ? '<p style="color:#888;font-style:italic;">Nenhum dado.</p>'
                    : `<table style="width:100%;border-collapse:collapse;font-size:.85em;">
                        <thead><tr style="background:#f5f0eb;">
                            <th style="padding:7px 10px;text-align:left;font-size:.72em;color:#9a958e;text-transform:uppercase;border-bottom:2px solid #e2e0da;">Categoria</th>
                            <th style="padding:7px 10px;text-align:center;font-size:.72em;color:#9a958e;text-transform:uppercase;border-bottom:2px solid #e2e0da;">Total</th>
                            <th style="padding:7px 10px;text-align:center;font-size:.72em;color:#2e7d32;text-transform:uppercase;border-bottom:2px solid #e2e0da;">Aprovadas</th>
                            <th style="padding:7px 10px;text-align:center;font-size:.72em;color:#c62828;text-transform:uppercase;border-bottom:2px solid #e2e0da;">Recusadas</th>
                            <th style="padding:7px 10px;text-align:right;font-size:.72em;color:#9a958e;text-transform:uppercase;border-bottom:2px solid #e2e0da;">Faturado</th>
                            <th style="padding:7px 10px;text-align:right;font-size:.72em;color:#c62828;text-transform:uppercase;border-bottom:2px solid #e2e0da;">Perdido</th>
                        </tr></thead>
                        <tbody>${catEntries.map(([cat,d],i)=>`
                            <tr style="background:${i%2===0?'#fff':'#fafaf8'};">
                                <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600;">${esc(cat)}</td>
                                <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700;">${d.total}</td>
                                <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center;color:#2e7d32;font-weight:700;">${d.approved}</td>
                                <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center;color:#c62828;font-weight:700;">${d.rejected}</td>
                                <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#7b3e19;">${fv(d.revenue)}</td>
                                <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;color:#c62828;">${d.perdido>0?fv(d.perdido):'-'}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>`
                }
            </div>

            <!-- Rodapé -->
            <div style="border-top:2px solid #e2e0da;padding-top:14px;text-align:center;color:#9a958e;font-size:.75em;">
                ${esc(settings.companyName||'RSP')} · ${esc(settings.owner||'')} · ${esc(settings.phone||'')}
                &nbsp;·&nbsp; Relatório gerado automaticamente pelo sistema RSP
            </div>

        </div>`;

        // ── Cria elemento temporário e gera PDF ───────────────────────────────
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        const filename = 'Relatorio_RSP_' + new Date().toISOString().split('T')[0] + '.pdf';
        await html2pdf().set({
            margin:      [0.4, 0.4, 0.4, 0.4],
            filename:    filename,
            image:       { type: 'jpeg', quality: 0.97 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF:       { unit: 'in', format: 'a4', orientation: 'portrait' }
        }).from(wrapper).save();

        document.body.removeChild(wrapper);
        showToast('✅ PDF gerado com sucesso!', 'success');

    } catch(e) {
        console.error('PDF error:', e);
        showToast('❌ Erro ao gerar PDF: ' + e.message, 'error', 6000);
    } finally {
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
