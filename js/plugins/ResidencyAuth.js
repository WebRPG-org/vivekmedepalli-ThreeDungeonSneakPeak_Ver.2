/*:
 * @plugindesc Resident login overlay for New Game and Continue.
 * @author ThreeDungeons
 *
 * @help Requires Section 6 Edge Function resident-login. Configure baasUrl in plugin parameters.
 *
 * @param baasUrl
 * @desc Supabase project URL (e.g. https://xxxxx.supabase.co). Leave empty until configured.
 * @default
 *
 * @param loginPath
 * @desc Edge Function path for resident login.
 * @default /functions/v1/resident-login
 *
 */

(function() {
    'use strict';

    var params = PluginManager.parameters('ResidencyAuth');
    var BAAS_URL = String(params['baasUrl'] || '').trim();
    var LOGIN_PATH = String(params['loginPath'] || '/functions/v1/resident-login');

    // --- Session helpers ---

    function hasSession() {
        return !!sessionStorage.getItem('residency_token');
    }

    function storeSession(token, residentId, programId) {
        sessionStorage.setItem('residency_token', token);
        sessionStorage.setItem('residency_resident_id', residentId);
        sessionStorage.setItem('residency_program_id', programId);
    }

    // --- Overlay ---

    var OVERLAY_ID = 'residency-auth-overlay';
    var BOX_ID = 'residency-auth-box';
    var EMAIL_ID = 'residency-email';
    var PASSWORD_ID = 'residency-password';
    var SUBMIT_ID = 'residency-submit';
    var ERROR_ID = 'residency-error';

    var overlayStyles = [
        'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999;',
        'background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center;',
        'font-family: GameFont, sans-serif;'
    ].join(' ');

    var boxStyles = [
        'background: #1a1a2e; border: 1px solid #444; border-radius: 8px; padding: 24px;',
        'max-width: 360px; width: 90%;'
    ].join(' ');

    var inputStyles = [
        'display: block; width: 100%; box-sizing: border-box; margin-bottom: 12px; padding: 10px 12px;',
        'background: #0f0f1a; color: #e0e0e0; border: 1px solid #444; border-radius: 4px;',
        'font-family: inherit; font-size: 16px;'
    ].join(' ');

    var buttonStyles = [
        'display: block; width: 100%; padding: 12px; margin-top: 8px;',
        'background: #2d5a87; color: #fff; border: none; border-radius: 4px;',
        'font-family: inherit; font-size: 16px; cursor: pointer;'
    ].join(' ');

    var errorStyles = 'color: #e74c3c; font-size: 14px; margin-top: 12px; display: none;';

    function createOverlay() {
        var overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = overlayStyles;

        var box = document.createElement('div');
        box.id = BOX_ID;
        box.style.cssText = boxStyles;

        var title = document.createElement('h2');
        title.textContent = 'Resident Login';
        title.style.cssText = 'color: #e0e0e0; margin: 0 0 16px 0; font-size: 20px; font-weight: normal;';

        var emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.id = EMAIL_ID;
        emailInput.placeholder = 'Email';
        emailInput.autocomplete = 'email';
        emailInput.style.cssText = inputStyles;

        var passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = PASSWORD_ID;
        passwordInput.placeholder = 'Password';
        passwordInput.autocomplete = 'current-password';
        passwordInput.style.cssText = inputStyles;

        var submitBtn = document.createElement('button');
        submitBtn.id = SUBMIT_ID;
        submitBtn.textContent = 'Sign In';
        submitBtn.style.cssText = buttonStyles;

        var errorDiv = document.createElement('div');
        errorDiv.id = ERROR_ID;
        errorDiv.style.cssText = errorStyles;

        var focusStyle = document.createElement('style');
        focusStyle.textContent = '#residency-auth-overlay input:focus { border-color: #2d5a87; outline: none; }';
        overlay.appendChild(focusStyle);
        box.appendChild(title);
        box.appendChild(emailInput);
        box.appendChild(passwordInput);
        box.appendChild(submitBtn);
        box.appendChild(errorDiv);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        return { overlay: overlay, emailInput: emailInput, passwordInput: passwordInput, submitBtn: submitBtn, errorDiv: errorDiv };
    }

    function removeOverlay() {
        var el = document.getElementById(OVERLAY_ID);
        if (el) el.remove();
    }

    function showError(el, msg) {
        el.textContent = msg;
        el.style.display = 'block';
    }

    function hideError(el) {
        el.textContent = '';
        el.style.display = 'none';
    }

    function setLoading(btn, loading) {
        btn.disabled = loading;
        btn.textContent = loading ? 'Signing in...' : 'Sign In';
    }

    // --- Auth ---

    var _orig_commandNewGame = Scene_Title.prototype.commandNewGame;
    var _orig_commandContinue = Scene_Title.prototype.commandContinue;

    function authenticate(email, password, mode, sceneRef, elements) {
        if (!BAAS_URL) {
            showError(elements.errorDiv, 'Login not configured. Contact your program leader.');
            return;
        }
        if (!email || !password) {
            showError(elements.errorDiv, 'Please enter email and password.');
            return;
        }

        hideError(elements.errorDiv);
        setLoading(elements.submitBtn, true);

        var url = BAAS_URL + LOGIN_PATH;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        })
        .then(function(res) {
            return res.json().then(function(data) {
                return { ok: res.ok, status: res.status, data: data };
            });
        })
        .then(function(result) {
            setLoading(elements.submitBtn, false);
            if (!result.ok) {
                var msg = (result.data && result.data.error) ? result.data.error : 'Invalid email or password.';
                showError(elements.errorDiv, msg);
                return;
            }
            if (!result.data || !result.data.token || !result.data.residentId || !result.data.programId) {
                showError(elements.errorDiv, 'Invalid response from server. Please try again.');
                return;
            }
            storeSession(result.data.token, result.data.residentId, result.data.programId);
            removeOverlay();
            if (mode === 'newGame') {
                _orig_commandNewGame.call(sceneRef);
            } else {
                _orig_commandContinue.call(sceneRef);
            }
        })
        .catch(function() {
            setLoading(elements.submitBtn, false);
            showError(elements.errorDiv, 'Network error. Please try again.');
        });
    }

    function showLoginOverlay(mode, sceneRef) {
        var elements = createOverlay();
        elements.emailInput.focus();

        function onSubmit() {
            var email = elements.emailInput.value.trim();
            var password = elements.passwordInput.value;
            authenticate(email, password, mode, sceneRef, elements);
        }

        elements.submitBtn.addEventListener('click', onSubmit);

        elements.passwordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') onSubmit();
        });

        elements.emailInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                elements.passwordInput.focus();
            }
        });
    }

    // --- Overrides ---

    Scene_Title.prototype.commandNewGame = function() {
        if (hasSession()) {
            _orig_commandNewGame.call(this);
            return;
        }
        showLoginOverlay('newGame', this);
    };

    Scene_Title.prototype.commandContinue = function() {
        if (hasSession()) {
            _orig_commandContinue.call(this);
            return;
        }
        showLoginOverlay('continue', this);
    };

})();
