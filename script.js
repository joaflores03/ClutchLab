/* ============================================================
   CLUTCHLAB — script.js (landing)
   Landing + Auth + Analyze
   ============================================================ */

'use strict';

/* ============================================================
   1. SCROLL ANIMATIONS + COUNTERS + PARALLAX + SMOOTH SCROLL
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -80px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');

        const counter = entry.target.querySelector('[data-counter]');
        if (counter && !counter.dataset.done) {
          animateCounter(counter);
          counter.dataset.done = 'true';
        }
      }
    });
  }, observerOptions);

  document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));

  document.querySelectorAll('.stat').forEach((stat) => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const counter = entry.target.querySelector('[data-counter]');
          if (counter && !counter.dataset.done) {
            animateCounter(counter);
            counter.dataset.done = 'true';
          }
        }
      });
    }, observerOptions);
    obs.observe(stat);
  });

  function animateCounter(el) {
    const target = parseFloat(el.dataset.counter);
    const suffix = el.dataset.suffix || '';
    const decimals = parseInt(el.dataset.decimal, 10) || 0;
    const duration = 1800;
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      el.textContent = current.toFixed(decimals) + suffix;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = target.toFixed(decimals) + suffix;
      }
    }
    requestAnimationFrame(frame);
  }

  const hero = document.querySelector('.hero');
  if (hero) {
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      if (scrolled < window.innerHeight) {
        hero.style.setProperty('--scroll', scrolled);
      }
    }, { passive: true });
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = 68;
        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
});


/* ============================================================
   2. AUTH — Login, registro, sesión y modal
   ============================================================ */
(function initAuth() {
  const API_BASE = 'http://localhost:8000';
  const TOKEN_KEY = 'clutchlab_token';
  const USER_KEY = 'clutchlab_user';
  const DASHBOARD_URL = '/dashboard.html';

  function start() {
    // ── Si ya está logueado, redirigir al dashboard
    if (localStorage.getItem(TOKEN_KEY)) {
      window.location.href = DASHBOARD_URL;
      return;
    }

    const modal          = document.getElementById('auth-modal');
    const modalClose     = document.getElementById('auth-modal-close');
    const tabs           = document.querySelectorAll('.auth-modal-tab');
    const formLogin      = document.getElementById('auth-form-login');
    const formRegister   = document.getElementById('auth-form-register');
    const loginError     = document.getElementById('login-error');
    const registerError  = document.getElementById('register-error');
    const loginSubmit    = document.getElementById('login-submit');
    const registerSubmit = document.getElementById('register-submit');
    const navLoginBtn    = document.getElementById('nav-login-btn');

    if (!modal || !navLoginBtn) {
      console.error('[auth] Faltan elementos en el HTML (auth-modal o nav-login-btn)');
      return;
    }

    // ── API pública
    window.ClutchLabAuth = {
      getToken: () => localStorage.getItem(TOKEN_KEY),
      getUser: () => {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      },
      isLoggedIn: () => !!localStorage.getItem(TOKEN_KEY),
      openModal: (tab = 'login') => openModal(tab),
      requireAuth: (callback) => {
        if (localStorage.getItem(TOKEN_KEY)) callback();
        else openModal('login');
      },
    };

    // ── Modal
    function openModal(tab = 'login') {
      modal.classList.add('active');
      switchTab(tab);
    }

    function closeModal() {
      modal.classList.remove('active');
      if (loginError) loginError.classList.remove('visible');
      if (registerError) registerError.classList.remove('visible');
    }

    function switchTab(tab) {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      if (formLogin) formLogin.style.display = tab === 'login' ? 'flex' : 'none';
      if (formRegister) formRegister.style.display = tab === 'register' ? 'flex' : 'none';
    }

    tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    if (modalClose) modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // ── Login
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (loginError) loginError.classList.remove('visible');
        loginSubmit.disabled = true;
        loginSubmit.textContent = 'Entrando...';

        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('login-email').value.trim(),
              password: document.getElementById('login-password').value,
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Error en login');

          localStorage.setItem(TOKEN_KEY, data.access_token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          window.location.href = DASHBOARD_URL;
        } catch (err) {
          if (loginError) {
            loginError.textContent = err.message;
            loginError.classList.add('visible');
          }
          loginSubmit.disabled = false;
          loginSubmit.textContent = 'Entrar';
        }
      });
    }

    // ── Registro
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (registerError) registerError.classList.remove('visible');
        registerSubmit.disabled = true;
        registerSubmit.textContent = 'Creando...';

        try {
          const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('register-email').value.trim(),
              username: document.getElementById('register-username').value.trim(),
              password: document.getElementById('register-password').value,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            const msg = typeof data.detail === 'string' ? data.detail : 'Error en el registro';
            throw new Error(msg);
          }

          localStorage.setItem(TOKEN_KEY, data.access_token);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          window.location.href = DASHBOARD_URL;
        } catch (err) {
          if (registerError) {
            registerError.textContent = err.message;
            registerError.classList.add('visible');
          }
          registerSubmit.disabled = false;
          registerSubmit.textContent = 'Crear cuenta';
        }
      });
    }

    navLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal('login');
    });

    console.log('[auth] ✅ initAuth cargado correctamente');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();


/* ============================================================
   3. ANALYZE — Redirige al dashboard para subir la demo
   ============================================================ */
(function initAnalyze() {
  function start() {
    const btnHero  = document.getElementById('btn-analyze-hero');
    const btnFinal = document.getElementById('btn-analyze-final');
    const btnNav   = document.getElementById('btn-analyze-nav');

    const goToDashboard = () => {
      if (localStorage.getItem('clutchlab_token')) {
        window.location.href = '/dashboard.html';
      } else {
        window.ClutchLabAuth?.openModal('login');
      }
    };

    if (btnHero)  btnHero.addEventListener('click', goToDashboard);
    if (btnFinal) btnFinal.addEventListener('click', goToDashboard);
    if (btnNav)   btnNav.addEventListener('click', goToDashboard);

    console.log('[analyze] ✅ initAnalyze cargado correctamente');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();