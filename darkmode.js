// darkmode.js — gerencia o tema claro/escuro em todas as páginas
(function () {
    // Aplica tema salvo IMEDIATAMENTE (antes do render para evitar flash)
    var saved = localStorage.getItem('rsp_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('rsp_theme', theme);
        // Atualiza todos os botões da página
        document.querySelectorAll('.dark-toggle').forEach(function (btn) {
            btn.innerHTML = theme === 'dark'
                ? '<span class="toggle-icon">☀️</span> Modo Claro'
                : '<span class="toggle-icon">🌙</span> Modo Escuro';
            btn.title = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
        });
    }

    window.toggleDarkMode = function () {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current === 'dark' ? 'light' : 'dark');
    };

    // Injeta o botão na navbar quando o DOM estiver pronto
    function injectToggleButton() {
        var navLinks = document.querySelector('.navbar .nav-links');
        if (!navLinks) return;
        // Evita duplicatas
        if (navLinks.querySelector('.dark-toggle')) return;

        var btn = document.createElement('button');
        btn.className = 'dark-toggle';
        btn.onclick = window.toggleDarkMode;
        navLinks.appendChild(btn);

        // Define texto inicial
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current); // re-aplica para atualizar o botão recém-criado
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggleButton);
    } else {
        injectToggleButton();
    }
})();
