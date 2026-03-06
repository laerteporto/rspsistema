// auth.js — Sistema de Autenticação RSP
// Criptografia: PBKDF2 + SHA-256 via Web Crypto API (nativa, sem libs externas)
// A senha NUNCA é armazenada em texto puro — apenas o hash derivado

(function () {
    'use strict';

    // ── Configuração de credenciais ─────────────────────────────────────────
    // Hashes gerados com PBKDF2 (310.000 iterações, SHA-256)
    // Para alterar a senha: rode o script hash-generator.html e atualize abaixo
    const CREDENTIALS = {
        laerte: {
            // Salt único por usuário (derivado de RSP_SALT_<usuario>_2026 via SHA-256)
            salt: '1f845c63635eb9746947ea487a6441585347b2e62d43c227758284b75e7271d1',
            // Hash PBKDF2 (senha protegida — não armazenada em texto puro)
            hash: 'e6b1ad069811458fc65112cc3529b5dc8e8aa04b74f0fdf622935537152d631b',
        }
    };

    const SESSION_KEY  = 'rsp_auth_session';
    const SESSION_MINS = 480; // 8 horas de sessão

    // ── Páginas protegidas (quote_approval.html é pública para o cliente) ───
    const PUBLIC_PAGES = ['login.html', 'quote_approval.html'];

    // ── Helpers criptográficos ──────────────────────────────────────────────

    // Converte hex string → ArrayBuffer
    function hexToBuffer(hex) {
        const bytes = new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
        return bytes.buffer;
    }

    // Converte ArrayBuffer → hex string
    function bufferToHex(buf) {
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Deriva hash PBKDF2 da senha usando Web Crypto API
    async function derivePBKDF2(password, saltHex) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: hexToBuffer(saltHex),
                iterations: 310000,   // OWASP 2024 recomenda 310k para SHA-256
                hash: 'SHA-256'
            },
            keyMaterial,
            256  // 32 bytes
        );
        return bufferToHex(derivedBits);
    }

    // ── Sessão ──────────────────────────────────────────────────────────────

    function createSession(username) {
        const session = {
            user: username,
            expires: Date.now() + SESSION_MINS * 60 * 1000,
            // Token de sessão aleatório para invalidação manual
            token: bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function getSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || !s.user || !s.expires) return null;
            if (Date.now() > s.expires) {
                sessionStorage.removeItem(SESSION_KEY);
                return null;
            }
            return s;
        } catch (_) { return null; }
    }

    function destroySession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    // ── Verificação de acesso ───────────────────────────────────────────────

    function isPublicPage() {
        const page = window.location.pathname.split('/').pop() || 'index.html';
        return PUBLIC_PAGES.some(p => page === p || page === '');
    }

    function requireAuth() {
        if (isPublicPage()) return; // login.html e quote_approval são públicas
        const session = getSession();
        if (!session) {
            // Salva a URL que tentou acessar para redirecionar após login
            sessionStorage.setItem('rsp_redirect', window.location.href);
            window.location.replace('login.html');
        }
    }

    // ── Login ───────────────────────────────────────────────────────────────

    async function attemptLogin(username, password) {
        const user = (username || '').trim().toLowerCase();
        const cred = CREDENTIALS[user];

        if (!cred) return false; // usuário não existe

        const derived = await derivePBKDF2(password, cred.salt);
        return derived === cred.hash;
    }

    // ── Logout ──────────────────────────────────────────────────────────────

    function logout() {
        destroySession();
        window.location.replace('login.html');
    }

    // ── Exibe usuário logado + botão logout na navbar ───────────────────────

    function injectLogoutButton() {
        const session = getSession();
        if (!session) return;
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;

        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline';
        btn.style.cssText = 'margin-left:1.5rem;padding:.35rem .8rem;font-size:.8rem;border-color:var(--danger);color:var(--danger);';
        btn.innerHTML = `👤 ${session.user} &nbsp;|&nbsp; Sair`;
        btn.onclick = () => {
            if (confirm('Deseja sair do sistema?')) logout();
        };
        navLinks.appendChild(btn);
    }

    // ── API pública ─────────────────────────────────────────────────────────
    window.RSPAuth = {
        requireAuth,
        attemptLogin,
        createSession,
        getSession,
        logout,
        injectLogoutButton,
    };

    // ── Auto-executa proteção ao carregar qualquer página ───────────────────
    requireAuth();

})();
