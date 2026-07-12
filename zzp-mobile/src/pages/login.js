import { signIn } from '../auth.js';
import { navigate } from '../router.js';

export async function load() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="login-screen">
      <div class="login-box">
        <div class="login-logo">
          <img src="/icons/icon-192.png" alt="ZZP Manager" width="64" height="64">
        </div>
        <h1>ZZP Manager</h1>
        <p class="login-subtitle">Zaloguj się, aby dodawać koszty i faktury</p>

        <div class="login-card">
          <div class="form-group">
            <label>E-mail</label>
            <input type="email" id="login-email" autocomplete="username" placeholder="ty@example.com">
          </div>
          <div class="form-group">
            <label>Hasło</label>
            <input type="password" id="login-password" autocomplete="current-password" placeholder="••••••••">
          </div>

          <div id="login-error" class="error-msg hidden"></div>

          <button class="btn btn-primary btn-block" id="login-submit-btn">Zaloguj się</button>
        </div>
      </div>
    </div>
  `;

  const submit = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-submit-btn');

    errorEl.classList.add('hidden');

    if (!email || !password) {
      errorEl.textContent = 'Wpisz e-mail i hasło.';
      errorEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Logowanie…';
    try {
      await signIn(email, password);
      navigate('dashboard');
    } catch (err) {
      errorEl.textContent = 'Błąd logowania: ' + err.message;
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Zaloguj się';
    }
  };

  document.getElementById('login-submit-btn').addEventListener('click', submit);
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}
