// auth.js — Autenticação RSP v2
// Criptografia: PBKDF2 + SHA-256 via Web Crypto API (nativa do browser)
// Senhas NUNCA armazenadas em texto — apenas hashes derivados

(function () {
    'use strict';

    // ── Credenciais (hashes gerados com Web Crypto API — não reversíveis) ──
    const CREDENTIALS = {
        laerte: {
            email: 'laertep@gmail.com',
            displayName: 'Laerte',
            salt: '1f845c63635eb9746947ea487a6441585347b2e62d43c227758284b75e7271d1',
            hash: '745e457f7c13e36c254c081814b941225e93b9dd3a16b8e7b176095c9394b49a',
        },
        rogerio: {
            email: 'laertep@gmail.com',
            displayName: 'Rogério',
            salt: 'ad81fea0890606f96a22a64d336c47a4c961befe4bc655963a04638762b06efb',
            hash: '205028b0d05d4b290c3e23d6c1225ccf4014f2d4f13dcdf23379cc7fe1ca9d41',
        },
       joao: {
            email: '',
            displayName: 'Joao',
            salt: '81f6f149c9623cd1c34ae107c228c04fdfa0a09e91e37e6ebdce96a34869b732',
            hash: '6788689b4ca4027fc4ae23a59f45feb6eecd5c1b00c3261cca1175aefd0f53b5',
        },
    };
    
    // Para adicionar novos usuários: abra hash-generator.html no browser

    const SESSION_KEY  = 'rsp_auth_session';
    const SESSION_MINS = 480; // 8 horas

    // Páginas públicas (sem autenticação necessária)
    const PUBLIC_PAGES = ['login.html', 'quote_approval.html'];

    // ── Helpers Web Crypto ─────────────────────────────────────────────────

    function hexToBuffer(hex) {
        const bytes = new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
        return bytes.buffer;
    }

    function bufferToHex(buf) {
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function derivePBKDF2(password, saltHex) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: hexToBuffer(saltHex),
                iterations: 310000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        return bufferToHex(bits);
    }

    // ── Sessão ─────────────────────────────────────────────────────────────

    function createSession(username) {
        const cred = CREDENTIALS[username.toLowerCase()];
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            user:        username.toLowerCase(),
            displayName: cred ? cred.displayName : username,
            expires:     Date.now() + SESSION_MINS * 60 * 1000,
            token:       bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
        }));
    }

    function getSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || !s.user || !s.expires) return null;
            if (Date.now() > s.expires) { sessionStorage.removeItem(SESSION_KEY); return null; }
            return s;
        } catch (_) { return null; }
    }

    function destroySession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    // ── Proteção de páginas ────────────────────────────────────────────────

    function isPublicPage() {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        return PUBLIC_PAGES.some(p => page === p);
    }

    function requireAuth() {
        if (isPublicPage()) return;
        if (!getSession()) {
            sessionStorage.setItem('rsp_redirect', window.location.href);
            window.location.replace('login.html');
        }
    }

    // ── Login ──────────────────────────────────────────────────────────────

    async function attemptLogin(username, password) {
        const user = (username || '').trim().toLowerCase();
        const cred = CREDENTIALS[user];
        if (!cred) return false;
        const derived = await derivePBKDF2(password, cred.salt);
        return derived === cred.hash;
    }

    // ── Recuperação de senha por email ────────────────────────────────────
    // Como é frontend puro, usa mailto: para abrir o cliente de email do usuário
    // com as instruções. Para automação real, use EmailJS ou similar.

    function sendPasswordRecovery(username) {
        const user = (username || '').trim().toLowerCase();
        const cred = CREDENTIALS[user];

        if (!cred || !cred.email) return false;

        const subject = encodeURIComponent('RSP Serviços — Recuperação de Senha');
        const body = encodeURIComponent(
            'Olá ' + (cred.displayName || user) + ',\n\n' +
            'Você solicitou recuperação de senha no RSP Sistema.\n\n' +
            'Para redefinir sua senha, entre em contato com o administrador do sistema ' +
            'ou acesse o arquivo auth.js para atualizar o hash da nova senha.\n\n' +
            'RSP Serviços'
        );
        window.open(`mailto:${cred.email}?subject=${subject}&body=${body}`, '_self');
        return true;
    }

    // ── Logout ─────────────────────────────────────────────────────────────

    function logout() {
        destroySession();
        window.location.replace('login.html');
    }

    // ── Botão logout na navbar ─────────────────────────────────────────────

    function injectLogoutButton() {
        const session = getSession();
        if (!session) return;
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;

        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline';
        btn.style.cssText = 'margin-left:1.5rem;padding:.3rem .75rem;font-size:.78rem;' +
            'border-color:var(--danger,#c62828);color:var(--danger,#c62828);white-space:nowrap;';
        btn.innerHTML = `👤 ${session.displayName} &nbsp;·&nbsp; Sair`;
        btn.title = 'Clique para sair do sistema';
        btn.onclick = () => { if (confirm('Deseja sair do sistema?')) logout(); };
        navLinks.appendChild(btn);
    }

    // ── API pública ────────────────────────────────────────────────────────
    window.RSPAuth = {
        requireAuth,
        attemptLogin,
        createSession,
        getSession,
        destroySession,
        logout,
        injectLogoutButton,
        sendPasswordRecovery,
        getUsers: () => Object.entries(CREDENTIALS).map(([k, v]) => ({
            username: k,
            displayName: v.displayName,
            email: v.email
        })),
    };

    // Executa proteção imediatamente
    requireAuth();

})();
