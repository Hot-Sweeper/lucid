// Resolve only the settings needed by the hiring composer. Never expose account config.
function hireDefaults(settings, projectId, project = null) {
  const stored = settings.projectSettingsOverrides?.[projectId] || {};
  const legacy = settings.projectSettingsFolded ? null : project?.defaultModelSelection;
  const selection = Object.hasOwn(stored, 'defaultModelSelection') ? stored.defaultModelSelection : legacy || settings.defaultModelSelection;
  return {
    selection: selection ? { providerInstanceId: selection.instanceId, model: selection.model, options: Object.fromEntries((Array.isArray(selection.options) ? selection.options : Object.entries(selection.options || {}).map(([id, value]) => ({ id, value }))).map(o => [o.id, o.value])) } : null,
    source: Object.hasOwn(stored, 'defaultModelSelection') || legacy ? 'Project defaults' : 'T3 defaults',
    runtimeMode: stored.defaultRuntimeMode || settings.defaultRuntimeMode,
  };
}

function launchPayload({ project, message, provider, model, options, requestId }, runtimeMode) {
  if (!project || !String(message || '').trim() || !provider || !model || !requestId || !runtimeMode) throw Error('Choose a project, harness and model before hiring.');
  return {
    commandId: requestId, threadId: requestId, projectId: project,
    title: message.trim().split('\n')[0].slice(0, 100), generateTitle: true,
    modelSelection: { instanceId: provider, model, options: Object.entries(options || {}).map(([id, value]) => ({ id, value })) },
    runtimeMode, interactionMode: 'default', workspaceStrategy: { type: 'root' },
    initialMessage: { messageId: requestId, text: message, attachments: [] },
  };
}

module.exports = { hireDefaults, launchPayload };
