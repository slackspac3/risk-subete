const AdminOrgSetupSection = (() => {
  let latestContext = null;

  function configure(context) {
    latestContext = context;
  }

  function renderSections({ companyEntities, departmentEntities, companyStructure }) {
    const introSection = renderSettingsSection({
      title: 'How This Screen Works',
      scope: 'admin-settings',
      description: 'Build the organisation tree first, manage context from each entity, then rely on platform defaults as fallback.',
      open: true,
      meta: `${companyEntities.length} business units mapped`,
      body: `<div class="context-grid">
        <div class="context-chip-panel">
          <div class="context-panel-title">1. Build the organisation tree</div>
          <p class="context-panel-copy">Add holdings, subsidiaries, portfolio companies, partners, and departments in one place.</p>
        </div>
        <div class="context-chip-panel">
          <div class="context-panel-title">2. Manage context from each node</div>
          <p class="context-panel-copy">Use the tree actions to edit retained business or department context directly on the entity you are working on.</p>
        </div>
        <div class="context-chip-panel">
          <div class="context-panel-title">3. Use platform defaults as fallback</div>
          <p class="context-panel-copy">Global geography, regulations, thresholds, and AI defaults sit underneath the entity-specific setup.</p>
        </div>
      </div>`
    });
    const treeSection = renderSettingsSection({
      title: 'Organisation Tree',
      scope: 'admin-settings',
      description: "Use this as the main operating view. Add businesses and departments here, then manage each node's retained context from the same tree.",
      meta: `${companyEntities.length} businesses · ${departmentEntities.length} departments`,
      open: true,
      body: `<div class="card" style="padding:var(--sp-5);background:var(--bg-elevated)">
        <div class="context-panel-title">Organisation Tree</div>
        <div class="flex items-center gap-3 mt-3" style="flex-wrap:wrap">
          <button class="btn btn--secondary" id="btn-add-org-entity">Add Entity</button>
          <button class="btn btn--secondary" id="btn-add-org-function">Add Function / Department</button>
          <span class="form-help">Context is now managed directly inside the tree.</span>
        </div>
        <div id="admin-company-structure-summary" class="mt-4">${renderCompanyStructureSummary(companyStructure)}</div>
      </div>`
    });
    return introSection + treeSection;
  }

  function _persistAdminTreeState() {
    const { companyStructure, entityContextLayers } = latestContext;
    saveAdminSettings({
      ...getAdminSettings(),
      companyStructure,
      entityContextLayers
    });
  }

  function _renderEntityLayerSummary() {
    const { layerSummaryEl, entityContextLayers, companyStructure } = latestContext;
    if (!layerSummaryEl) return;
    if (!entityContextLayers.length) {
      layerSummaryEl.innerHTML = `<div class="empty-state">No business or function context layers have been saved yet.</div>`;
      return;
    }
    const idToNode = new Map(companyStructure.map(node => [node.id, node]));
    layerSummaryEl.innerHTML = entityContextLayers.map(layer => {
      const node = idToNode.get(layer.entityId);
      return `
        <div class="card" style="padding:var(--sp-4);margin-top:12px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="badge badge--gold">${node?.type || 'Saved layer'}</span>
            <strong style="color:var(--text-primary)">${node?.name || layer.entityName}</strong>
            ${layer.geography ? `<span class="form-help" style="margin-top:0">${layer.geography}</span>` : ''}
            <button class="btn btn--ghost btn--sm admin-layer-edit" data-layer-id="${layer.entityId}" type="button">Edit</button>
            <button class="btn btn--ghost btn--sm admin-layer-delete" data-layer-id="${layer.entityId}" type="button">Remove</button>
          </div>
          ${layer.contextSummary ? `<div class="form-help" style="margin-top:8px">${layer.contextSummary}</div>` : ''}
          ${layer.applicableRegulations?.length ? `<div class="citation-chips" style="margin-top:8px">${layer.applicableRegulations.map(tag => `<span class="badge badge--neutral">${tag}</span>`).join('')}</div>` : ''}
        </div>`;
    }).join('');
    _bindLayerActionHandlers();
  }

  function _bindLayerActionHandlers() {
    const { layerSummaryEl, companyStructure, entityContextLayers } = latestContext;
    layerSummaryEl?.querySelectorAll('.admin-layer-edit').forEach(button => {
      button.addEventListener('click', () => {
        const target = companyStructure.find(item => item.id === button.dataset.layerId);
        if (!target) return;
        openEntityContextLayerEditor({
          entity: target,
          settings: getAdminSettings(),
          onSave: (nextLayer, modal) => {
            const existingIndex = entityContextLayers.findIndex(item => item.entityId === nextLayer.entityId);
            if (existingIndex > -1) entityContextLayers[existingIndex] = nextLayer;
            else entityContextLayers.push(nextLayer);
            _persistAdminTreeState();
            modal.close();
            _renderEntityLayerSummary();
            UI.toast(`Saved context for ${target.name}.`, 'success');
          }
        });
      });
    });
    layerSummaryEl?.querySelectorAll('.admin-layer-delete').forEach(button => {
      button.addEventListener('click', async () => {
        const entityId = button.dataset.layerId;
        const index = entityContextLayers.findIndex(item => item.entityId === entityId);
        if (index < 0) return;
        if (!await UI.confirm('Remove this business or department context layer?')) return;
        entityContextLayers.splice(index, 1);
        _persistAdminTreeState();
        _renderEntityLayerSummary();
        UI.toast('Context layer removed.', 'success');
      });
    });
  }

  function _refreshStructureSummary() {
    const { structureSummaryEl, companyStructure } = latestContext;
    if (!structureSummaryEl) return;
    structureSummaryEl.innerHTML = renderCompanyStructureSummary(companyStructure);
    _bindStructureActionHandlers();
  }

  function _upsertCompanyStructureNode(node) {
    const { companyStructure } = latestContext;
    const index = companyStructure.findIndex(item => item.id === node.id);
    if (index > -1) companyStructure[index] = node;
    else companyStructure.push(node);
    _persistAdminTreeState();
    _refreshStructureSummary();
    _renderEntityLayerSummary();
  }

  function openEntityEditor(existingNode = null, seed = {}) {
    const { companyStructure, regsInput, profileEl, websiteEl, entityContextLayers } = latestContext;
    const departmentEditorMode = isDepartmentEntityType(existingNode?.type || seed.type || '');
    const editor = openOrgEntityEditor({
      structure: companyStructure,
      existingNode,
      seed,
      onSave: (node, modal) => {
        if (node.contextSections) {
          node.profile = serialiseCompanyContextSections(node.contextSections);
        }
        _upsertCompanyStructureNode(node);
        if (node.profile && profileEl) profileEl.value = node.profile;
        if (node.websiteUrl && websiteEl) websiteEl.value = node.websiteUrl;
        modal.close();
        UI.toast(`${node.name} saved to the organisation tree.`, 'success', 5000);
      }
    });
  }

  function _bindStructureActionHandlers() {
    const { structureSummaryEl, companyStructure, entityContextLayers } = latestContext;
    if (!structureSummaryEl) return;
    structureSummaryEl.querySelectorAll('.org-summary-action').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-context').forEach(button => {
      button.addEventListener('click', () => {
        const target = companyStructure.find(node => node.id === button.dataset.orgId);
        if (!target) return;
        openEntityContextLayerEditor({
          entity: target,
          settings: getAdminSettings(),
          onSave: (nextLayer, modal) => {
            const existingIndex = entityContextLayers.findIndex(item => item.entityId === nextLayer.entityId);
            if (existingIndex > -1) entityContextLayers[existingIndex] = nextLayer;
            else entityContextLayers.push(nextLayer);
            _persistAdminTreeState();
            modal.close();
            _renderEntityLayerSummary();
            UI.toast(`Saved context for ${target.name}.`, 'success');
          }
        });
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-add-department').forEach(button => {
      button.addEventListener('click', () => {
        openEntityEditor(null, { type: 'Department / function', parentId: button.dataset.orgId || '' });
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-edit').forEach(button => {
      button.addEventListener('click', () => {
        const target = companyStructure.find(node => node.id === button.dataset.orgId);
        if (target) openEntityEditor(target);
      });
    });
    structureSummaryEl.querySelectorAll('.org-entity-delete').forEach(button => {
      button.addEventListener('click', async () => {
        const targetId = button.dataset.orgId;
        const target = companyStructure.find(node => node.id === targetId);
        if (!target) return;
        if (!await UI.confirm(`Remove ${target.name} and anything nested beneath it from the organisation tree?`)) return;
        const removeIds = new Set([targetId]);
        let changed = true;
        while (changed) {
          changed = false;
          companyStructure.forEach(node => {
            if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
              removeIds.add(node.id);
              changed = true;
            }
          });
        }
        for (let i = companyStructure.length - 1; i >= 0; i -= 1) {
          if (removeIds.has(companyStructure[i].id)) companyStructure.splice(i, 1);
        }
        for (let i = entityContextLayers.length - 1; i >= 0; i -= 1) {
          if (removeIds.has(entityContextLayers[i].entityId)) entityContextLayers.splice(i, 1);
        }
        _persistAdminTreeState();
        _refreshStructureSummary();
        _renderEntityLayerSummary();
        UI.toast(`${target.name} removed from the organisation tree.`, 'success');
      });
    });
  }

  function bind(context) {
    configure(context);
    document.getElementById('btn-add-org-entity')?.addEventListener('click', () => openEntityEditor());
    document.getElementById('btn-add-org-function')?.addEventListener('click', () => openEntityEditor(null, { type: 'Department / function' }));
    _bindStructureActionHandlers();
    _renderEntityLayerSummary();
  }

  return {
    configure,
    renderSections,
    bind,
    openEntityEditor
  };
})();
