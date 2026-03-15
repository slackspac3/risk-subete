const AdminSystemAccessSection = (() => {
  function renderSection({ directCompass, sessionLLM }) {
    return renderSettingsSection({
      title: 'System Access',
      scope: 'admin-settings',
      description: directCompass ? 'Use direct Compass access for temporary testing only. For production, prefer a hosted proxy URL such as the Vercel endpoint.' : 'A hosted proxy URL is configured. Leave the browser key blank and test through the proxy.',
      meta: sessionLLM.model || 'gpt-5.1',
      body: `<div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="admin-compass-url">Compass URL</label>
          <input class="form-input" id="admin-compass-url" value="${sessionLLM.apiUrl || DEFAULT_COMPASS_PROXY_URL}">
          <span class="form-help">Use <code>${DEFAULT_COMPASS_PROXY_URL}</code> for the hosted proxy path.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-compass-model">Model</label>
          <input class="form-input" id="admin-compass-model" value="${sessionLLM.model || 'gpt-5.1'}">
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-compass-key">Compass API Key</label>
        <input class="form-input" id="admin-compass-key" type="password" value="${sessionLLM.apiKey || ''}" placeholder="Paste key for this browser session">
        <span class="form-help">Leave blank when using the hosted proxy. Only use a browser key for temporary direct testing.</span>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-save-session-llm">Save Session Key</button>
        <button class="btn btn--secondary" id="btn-test-session-llm">Test Connection</button>
        <button class="btn btn--ghost" id="btn-clear-session-llm">Clear Session Key</button>
        <span class="form-help">Stored in this admin browser for the PoC until you clear it.</span>
      </div>`
    });
  }

  function bind({ rerenderCurrentAdminSection }) {
    document.getElementById('btn-save-session-llm')?.addEventListener('click', () => {
      const config = getAdminLLMConfig();
      saveSessionLLMConfig(config);
      LLMService.setCompassConfig(config);
      UI.toast(config.apiKey ? 'Compass session key loaded for this session.' : 'Compass proxy/session settings loaded for this session.', 'success');
    });

    document.getElementById('btn-test-session-llm')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-test-session-llm');
      const config = getAdminLLMConfig();
      btn.disabled = true;
      btn.textContent = 'Testing…';
      try {
        LLMService.setCompassConfig(config);
        const result = await LLMService.testCompassConnection();
        UI.toast(result.message || 'Compass connection successful.', 'success', 5000);
      } catch (error) {
        UI.toast('Compass test failed: ' + error.message, 'danger', 6000);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection';
      }
    });

    document.getElementById('btn-clear-session-llm')?.addEventListener('click', () => {
      localStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX));
      sessionStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX));
      LLMService.clearCompassConfig();
      rerenderCurrentAdminSection();
      UI.toast('Compass browser key cleared.', 'success');
    });
  }

  return { renderSection, bind };
})();
