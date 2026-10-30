import { t } from './i18n.js';
import { esc } from './utils.js';
import { lsGet } from './ls-migrate.js';

export function passwordPage(locale, ui) {
  return `
    <div class="login-wrap">
      <div class="card login-card">
        <img class="brand-logo" src="./assets/logo-mark.png" alt="">
        <h1>${esc(t(locale, 'auth.changeTitle'))}</h1>
        <p class="tiny">${esc(t(locale, 'auth.changeHint'))}</p>
        <form class="form" data-action="change-password">
          <label>${esc(t(locale, 'auth.newPassword'))}<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
          <label>${esc(t(locale, 'auth.newPassword2'))}<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
          <button class="btn btn-primary" type="submit">${esc(t(locale, 'auth.setPassword'))}</button>
        </form>
        ${ui.authMessage ? `<p class="auth-error">${esc(ui.authMessage)}</p>` : ''}
      </div>
    </div>`;
}

function wakeGameHidden() {
  try { return lsGet('td-hide-wake-game', 'mkpc-hide-wake-game') === '1'; }
  catch (err) { return false; }
}

function dinoRun() {
  return `
    <div class="dino-run" id="dino-run" hidden aria-hidden="true">
      <div class="dino">
        <svg viewBox="0 0 72 48" xmlns="http://www.w3.org/2000/svg">
          <g fill="currentColor">
            <path d="M2 34 L16 28 L20 32 L16 38 Z"/>
            <rect x="16" y="24" width="28" height="14" rx="3"/>
            <rect x="36" y="12" width="10" height="20" rx="3"/>
            <rect x="44" y="16" width="20" height="11" rx="4"/>
            <rect class="dino-eye" x="54" y="19" width="3.2" height="3.2"/>
            <rect x="40" y="30" width="8" height="3" rx="1"/>
            <g class="dino-legs dino-legs-a">
              <rect x="24" y="36" width="4" height="8"/><rect x="22" y="43" width="9" height="3"/>
              <rect x="36" y="36" width="4" height="6"/><rect x="34" y="41" width="8" height="3"/>
            </g>
            <g class="dino-legs dino-legs-b">
              <rect x="24" y="36" width="4" height="6"/><rect x="24" y="41" width="8" height="3"/>
              <rect x="36" y="36" width="4" height="8"/><rect x="36" y="43" width="9" height="3"/>
            </g>
          </g>
        </svg>
      </div>
    </div>`;
}

export function loginPage(locale, ui) {
  const mode = ui.authMode || 'login';
  const wakeHidden = wakeGameHidden();
  return `
    <div class="login-wrap">
      <div class="login-stage">
      ${dinoRun()}
      <div class="login-shell">
      <aside id="wake-note" class="wake-box${wakeHidden ? ' is-hidden' : ''}" role="status">
        <p class="wake-line">${esc(t(locale, 'auth.wakeTitle'))}</p>
        <p class="wake-sub" id="wake-text">${esc(t(locale, 'auth.wakeIdle'))}</p>
        <button type="button" class="wake-toggle" aria-pressed="${wakeHidden ? 'true' : 'false'}" aria-controls="wake-game">${esc(t(locale, wakeHidden ? 'auth.wakeShow' : 'auth.wakeHide'))}</button>
        <canvas id="wake-game" aria-label="${esc(t(locale, 'auth.wakePlay'))}"></canvas>
        <p class="wake-help wake-help-keys">${esc(t(locale, 'auth.wakePlay'))}</p>
        <p class="wake-help wake-help-swipe">${esc(t(locale, 'auth.wakeSwipe'))}</p>
        <div class="wake-pad">
          <button type="button" data-dir="u" aria-label="up">↑</button>
          <button type="button" data-dir="l" aria-label="left">←</button>
          <button type="button" data-dir="d" aria-label="down">↓</button>
          <button type="button" data-dir="r" aria-label="right">→</button>
        </div>
      </aside>
      <div class="login-main">
      <div class="login-head">
        <img class="brand-logo" src="./assets/logo-mark.png" alt="">
        <h1>${esc(t(locale, 'brand'))}</h1>
        <p class="tiny">${esc(t(locale, 'auth.hello'))}</p>
        ${ui.googleClientId && mode !== 'google-signup' ? `<div id="google-btn" class="google-slot"></div><p class="tiny google-or">${esc(t(locale, 'auth.orEmail'))}</p>` : ''}
        <div class="tabs">
          <button type="button" class="tab ${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-id="login">${esc(t(locale, 'auth.login'))}</button>
          <button type="button" class="tab ${mode === 'signup' ? 'active' : ''}" data-action="auth-mode" data-id="signup">${esc(t(locale, 'auth.signup'))}</button>
          <button type="button" class="tab ${mode === 'forgot' ? 'active' : ''}" data-action="auth-mode" data-id="forgot">${esc(t(locale, 'auth.forgot'))}</button>
        </div>
      </div>
        ${mode === 'signup' ? `
          <form class="form" data-action="signup">
            <div class="form-row">
              <label>${esc(t(locale, 'auth.first'))}<input name="firstName" required autocomplete="given-name"></label>
              <label>${esc(t(locale, 'auth.last'))}<input name="lastName" required autocomplete="family-name"></label>
            </div>
            <label>${esc(t(locale, 'auth.chinese'))}<input name="chineseName" required placeholder="陳大文"></label>
            <label>${esc(t(locale, 'auth.nick'))}<input name="nickname" required maxlength="6" placeholder="陳"><span class="tiny">${esc(t(locale, 'auth.nickHint'))}</span></label>
            <label>${esc(t(locale, 'auth.email'))}<input type="email" name="email" required autocomplete="email"></label>
            <label>${esc(t(locale, 'auth.password'))}<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
            <button class="btn btn-primary" type="submit">${esc(t(locale, 'auth.create'))}</button>
          </form>` : ''}
        ${mode === 'login' ? `
          <form class="form" data-action="login">
            <label>${esc(t(locale, 'auth.email'))}<input type="email" name="email" required autocomplete="email" value="${esc(ui.prefillEmail || '')}"></label>
            <label>${esc(t(locale, 'auth.password'))}<input type="password" name="password" autocomplete="current-password"></label>
            <p class="tiny">${esc(t(locale, 'auth.orPin'))}</p>
            <label>${esc(t(locale, 'auth.pin'))}<input name="pin" inputmode="numeric" maxlength="6" autocomplete="one-time-code" value="${esc(ui.prefillPin || '')}"></label>
            <button class="btn btn-primary" type="submit">${esc(t(locale, 'auth.login'))}</button>
          </form>` : ''}
        ${mode === 'google-signup' ? `
          <form class="form" data-action="google-signup">
            <p class="tiny">${esc(t(locale, 'auth.googleHint'))}</p>
            <label>${esc(t(locale, 'auth.email'))}<input type="email" name="email" value="${esc((ui.googleProfile || {}).email || '')}" readonly></label>
            <div class="form-row">
              <label>${esc(t(locale, 'auth.first'))}<input name="firstName" required autocomplete="given-name" value="${esc((ui.googleProfile || {}).firstName || '')}"></label>
              <label>${esc(t(locale, 'auth.last'))}<input name="lastName" required autocomplete="family-name" value="${esc((ui.googleProfile || {}).lastName || '')}"></label>
            </div>
            <label>${esc(t(locale, 'auth.chinese'))}<input name="chineseName" required placeholder="陳大文"></label>
            <label>${esc(t(locale, 'auth.nick'))}<input name="nickname" required maxlength="6" placeholder="陳"><span class="tiny">${esc(t(locale, 'auth.nickHint'))}</span></label>
            <label>${esc(t(locale, 'auth.password'))}<input type="password" name="password" minlength="6" autocomplete="new-password"><span class="tiny">${esc(t(locale, 'auth.googlePassword'))}</span></label>
            <button class="btn btn-primary" type="submit">${esc(t(locale, 'auth.create'))}</button>
          </form>` : ''}
        ${mode === 'forgot' ? `
          <form class="form" data-action="forgot">
            <p class="tiny">${esc(t(locale, 'auth.forgotHint'))}</p>
            <label>${esc(t(locale, 'auth.email'))}<input type="email" name="email" required></label>
            <button class="btn btn-primary" type="submit">${esc(t(locale, 'auth.sendPin'))}</button>
          </form>` : ''}
        ${ui.authMessage ? `<p class="auth-error">${esc(ui.authMessage)}</p>` : ''}
      </div>
      </div>
      <p class="app-copy login-copy">${esc(t(locale, 'copy1'))}<br>${esc(t(locale, 'copy2'))}</p>
      </div>
    </div>`;
}
