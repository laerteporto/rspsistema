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

    let synced = 0, failed = 0;
    for (const order of local) {
        const id = String(order.id);

        // NUNCA sincroniza OS que foram excluídas
        if (LS.isDeleted(id)) {
            console.log('⛔ OS #' + id + ' está na lista negra — ignorada no sync');
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
                <td><strong>#${o.id}</strong></td>
                <td>${escHtml(o.clientName || '-')}</td>
                <td><span style="background:var(--primary-light);color:var(--primary-dark);padding:.2rem .6rem;border-radius:4px;font-size:.8rem;font-weight:600;">${escHtml(o.category || '-')}</span></td>
                <td style="color:var(--text-muted);font-size:.88rem;">${new Date(o.date).toLocaleDateString('pt-BR')}</td>
                <td>${statusBadge(o.status)}</td>
                <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
                    <button class="btn btn-sm btn-outline" onclick="location.href='service_form.html?id=${o.id}'">Ver OS</button>
                    <button class="btn btn-sm btn-outline" style="color:var(--danger);border-color:var(--danger);"
                        onclick="deleteOS('${o.id}', this)">🗑 Excluir</button>
                </td>`;
            tbody.appendChild(tr);
        });
        updateStats(sorted);
    }

    // Exposta globalmente para uso no onclick inline
    window.deleteOS = async function(osId, btn) {
        const orders = LS.getOrders();
        const os = orders.find(o => String(o.id) === String(osId));
        if (!os) return;

        const confirmMsg = 'Excluir OS #' + osId + ' de ' + (os.clientName || 'Cliente') + ' (' + (os.category || '-') + ')?\n\nEsta ação não pode ser desfeita.';
        if (!confirm(confirmMsg)) return;

        // Guarda texto original para restaurar se der erro
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = '⏳';

        try {
            // 1. Lista negra PRIMEIRO — impede sync/merge de restaurar
            LS.addDeletedId(osId);

            // 2. Remove do localStorage imediatamente
            LS.saveOrders(orders.filter(o => String(o.id) !== String(osId)));

            // 3. Remove linha da tabela COM ANIMAÇÃO (não espera Firebase)
            const row = tbody.querySelector('tr[data-os-id="' + osId + '"]');
            if (row) {
                row.style.transition = 'opacity .3s, transform .3s';
                row.style.opacity = '0';
                row.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    row.remove();
                    updateStats(LS.getOrders());
                    if (!tbody.querySelector('tr[data-os-id]')) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted);"><div style="font-size:2rem;margin-bottom:.5rem;">📋</div>Nenhuma OS cadastrada. <a href="service_form.html" style="color:var(--primary);font-weight:600;">Criar primeira OS</a></td></tr>';
                        updateStats([]);
                    }
                }, 320);
            }

            showToast('🗑 OS #' + osId + ' excluída.', 'info');

            // 4. Remove do Firebase em background COM TIMEOUT (não trava a UI)
            if (db) {
                const deletePromise = db.collection('orders').doc(String(osId)).delete();
                const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
                Promise.race([deletePromise, timeout])
                    .then(() => console.log('☁️ OS #' + osId + ' removida do Firebase'))
                    .catch(e => console.warn('Firebase delete (background):', e.message));
                // NÃO aguarda — UI já respondeu, lista negra garante que não volta
            }

        } catch(e) {
            console.error('Erro ao excluir OS:', e);
            showToast('❌ Erro ao excluir. Tente novamente.', 'error');
            // Restaura botão em caso de erro inesperado
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    };

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
                const local = LS.getOrders();
                const map = {};
                local.forEach(o => { map[String(o.id)] = o; });
                remote.forEach(o => {
                    const id = String(o.id);
                    if (!LS.isDeleted(id)) {          // ignora deletados
                        map[id] = { ...(map[id] || {}), ...o };
                    }
                });
                const merged = Object.values(map).filter(o => !LS.isDeleted(String(o.id)));
                LS.saveOrders(merged);
                renderOrders(merged);
            })
            .catch(e => {
                console.warn('Dashboard Firebase sync:', e.message);
                // Se falhar, usa local mesmo
            });
    }
}

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
                <td><strong>${escHtml(c.name)}</strong></td>
                <td><a href="https://wa.me/55${(c.phone||'').replace(/\D/g,'')}" target="_blank"
                    style="color:var(--whatsapp);text-decoration:none;font-weight:500;">📱 ${escHtml(c.phone)}</a></td>
                <td style="color:var(--text-muted);font-size:.88rem;">${escHtml(c.address || '-')}</td>
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
    function render(orders) {
        let revenue = 0, approved = 0, rejected = 0;
        const cats = {};
        orders.forEach(o => {
            if (o.status === 'completed' || o.status === 'approved') { revenue += (o.value || 0); approved++; }
            else if (o.status === 'rejected') rejected++;
            if (o.category && o.category !== 'Selecione...' && o.category !== '') {
                cats[o.category] = (cats[o.category] || 0) + 1;
            }
        });
        const el = id => document.getElementById(id);
        if (el('report-revenue'))    el('report-revenue').textContent = `R$ ${revenue.toFixed(2).replace('.', ',')}`;
        if (el('report-total-os'))   el('report-total-os').textContent = orders.length;
        if (el('report-approved'))   el('report-approved').textContent = approved;
        if (el('report-rejected'))   el('report-rejected').textContent = rejected;
        const total = approved + rejected;
        if (el('report-conversion')) el('report-conversion').textContent = total ? `${((approved/total)*100).toFixed(1)}%` : '0%';
        const catTb = document.querySelector('#report-categories-table tbody');
        if (catTb) {
            const entries = Object.entries(cats).sort((a,b) => b[1]-a[1]);
            catTb.innerHTML = entries.length
                ? entries.map(([c,n]) => `<tr><td>${c}</td><td><strong>${n}</strong></td></tr>`).join('')
                : '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">Nenhum dado ainda.</td></tr>';
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
