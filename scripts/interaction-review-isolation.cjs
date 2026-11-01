// Temporary renderer ablations for the isolated interaction benchmark only.
// These hide content or alter wheel cancellation. They are never product settings.
let sequence = 0;
module.exports = async ({ dbg, js, name = 'base' }) => {
  const selectors = {
    'no-grounds': '.outside-vector-canvas',
    'no-static-grounds': '.outside-native,.outside-quick,.outside-vector-canvas',
    'no-outdoor-live': '.outside-live',
    'no-office': '.room-layer,.desk-layer',
    'no-root-hint': '.world',
  };
  if (name !== 'base' && name !== 'passive-wheel' && name !== 'native-grounds' && !Object.hasOwn(selectors, name)) {
    throw Error('Unknown interaction isolation: ' + name);
  }
  const key = '__interactionIsolation' + Date.now() + '_' + ++sequence;
  const group = 'interaction-isolation-' + key;
  let cleaned = false, remote = false;
  const cleanup = async () => {
    if (cleaned) return;
    // Keep state until restoration succeeds, allowing a failed cleanup to retry.
    await js(`(() => {
      const state = window[${JSON.stringify(key)}];
      if (!state) return;
      if (state.wrapper) {
        state.scene.removeEventListener('wheel', state.wrapper, state.capture);
        state.scene.addEventListener('wheel', state.original, state.options);
      }
      state.style?.remove();
      if (state.nativeFallback) window.__world.redrawOutside();
      delete window[${JSON.stringify(key)}];
    })()`);
    if (remote) await dbg.sendCommand('Runtime.releaseObjectGroup', { objectGroup: group });
    cleaned = true;
  };
  cleanup.details = { name, diagnosticOnly: true };
  try {
    if (name === 'base') return cleanup;
    if (name === 'native-grounds') {
      const details = await js(`(() => {
        const tile=document.querySelector('.outside-vector-canvas canvas');
        if(!tile)throw Error('No retained outdoor tile for the context-loss fallback experiment');
        window[${JSON.stringify(key)}]={nativeFallback:true};
        tile.dispatchEvent(new Event('contextlost',{cancelable:true}));
        return {presentation:document.querySelector('.outside-viewport')?.dataset.presentation,quality:'existing bounded original SVG fallback'};
      })()`);
      Object.assign(cleanup.details,details);return cleanup;
    }
    if (Object.hasOwn(selectors, name)) {
      const selector = selectors[name], css = selector + (name === 'no-root-hint' ? '{will-change:auto!important}' : '{visibility:hidden!important}');
      const details = await js(`(() => {
        const style = document.createElement('style');
        style.id = ${JSON.stringify(key)};
        style.dataset.interactionIsolation = ${JSON.stringify(name)};
        style.textContent = ${JSON.stringify(css)};
        document.head.append(style);
        window[${JSON.stringify(key)}] = { style };
        return { matched: document.querySelectorAll(${JSON.stringify(selector)}).length,
          applied: !!style.sheet?.cssRules.length };
      })()`);
      Object.assign(cleanup.details, { selector, css, ...details });
      return cleanup;
    }

    remote = true;
    const scene = await dbg.sendCommand('Runtime.evaluate', {
      expression: 'window.__world.scene', objectGroup: group,
    });
    const sceneId = scene.result?.objectId;
    if (!sceneId || scene.exceptionDetails) throw Error('Interaction scene is unavailable');
    const { listeners } = await dbg.sendCommand('DOMDebugger.getEventListeners', { objectId: sceneId });
    const wheels = listeners.filter(listener => listener.type === 'wheel');
    // The current scene owns one camera wheel handler. Do not quietly replace
    // unknown extra handlers or ancestor listeners in an older/changed build.
    if (wheels.length !== 1 || !wheels[0].handler?.objectId) {
      throw Error('Passive isolation needs exactly one inspectable scene wheel handler, got ' + wheels.length);
    }
    const wheel = wheels[0];
    if (wheel.once) throw Error('Passive isolation cannot replace a once-only wheel handler');
    const installed = await dbg.sendCommand('Runtime.callFunctionOn', {
      objectId: wheel.handler.objectId,
      functionDeclaration: `function(scene, key, capture, passive) {
        const original = this;
        const options = { capture, passive, once: false };
        const wrapper = function(event) {
          // Native Event getters and methods require the real event as receiver.
          // Preserve every delta, coordinate, timestamp and propagation method;
          // only preventDefault is disabled for this ACK-path experiment.
          const proxy = new Proxy(event, { get(target, property) {
            if (property === 'preventDefault') return () => {};
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          } });
          return original.call(this, proxy);
        };
        window[key] = { scene, original, wrapper, capture, options };
        scene.removeEventListener('wheel', original, capture);
        scene.addEventListener('wheel', wrapper, { capture, passive: true });
        return { originalPassive: passive, capture, replaced: true };
      }`,
      arguments: [{ objectId: sceneId }, { value: key }, { value: !!wheel.useCapture }, { value: !!wheel.passive }],
      returnByValue: true,
    });
    if (installed.exceptionDetails) {
      throw Error(installed.exceptionDetails.exception?.description || installed.exceptionDetails.text || 'Passive isolation installation failed');
    }
    Object.assign(cleanup.details, installed.result?.value, {
      nativeDefaultsEnabled: true,
      caveat: 'Native default scrolling is enabled; reject samples if an in-world scrollable descendant moves. Proxy dispatch adds diagnostic overhead.',
    });
    return cleanup;
  } catch (error) {
    try { await cleanup(); } catch (restoreError) {
      throw new AggregateError([error, restoreError], 'Interaction isolation failed and restoration needs attention');
    }
    throw error;
  }
};
