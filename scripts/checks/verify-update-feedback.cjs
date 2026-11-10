const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { updateFailure } = require('../../electron/update-errors.cjs');

async function run() {
  const compiler = 'src/office/outside.ts(567,135): error TS2345: Argument of type Look is not assignable to number.\n' + 'compiler output\n'.repeat(100);
  const failure = updateFailure(Error(compiler), true);
  assert.equal(failure.kind, 'not-ready');
  assert.equal(failure.details, compiler);
  assert(failure.error.length < 250 && !failure.error.includes('outside.ts'));
  assert.match(failure.error, /installed version is still available/);
  assert(!updateFailure(Error(compiler), false).error.includes('still available'));
  assert.equal(updateFailure(Error('Source files changed while the update was being checked.'), true).kind, 'source-changed');
  assert.equal(updateFailure(Error('Another update is still running.'), true).kind, 'busy');
  assert.match(updateFailure(Error('ENOSPC write'), true).error, /disk space/);
  assert.match(updateFailure(Error('EBUSY rename'), true).error, /locked/);
  assert.match(updateFailure(Error('Command timed out'), true).error, /too long/);
  assert.equal(updateFailure(Object.assign(Error('Timed out'), {cleanupUnconfirmed:true}), true).kind, 'cleanup-pending');
  const aggregate = updateFailure(new AggregateError([Error('primary rename error'), Error('rollback error')], 'Promotion failed'), false);
  assert.match(aggregate.details, /primary rename error\nrollback error/);

  // Run the actual renderer handlers, including delayed IPC, without a live app.
  const source = fs.readFileSync(path.join(__dirname, '../../src/main.ts'), 'utf8');
  const start = source.indexOf('let updateState:');
  const end = source.indexOf('const attachDir =', start);
  assert(start >= 0 && end > start);
  const button = { textContent:'', title:'', disabled:false, addEventListener:(_name, fn) => { button.click = fn; }, getBoundingClientRect:() => ({left:1,bottom:2}), focus:() => {} };
  let status = {available:true,local:2}, result = failure, calls = 0, removed = 0, menu, copied;
  let subscriptionFails = false, cleanupFails = false, copyFails = false, release;
  const context = {
    setTimeout, clearTimeout, $:() => button, companionClient:() => false,
    showMenu:(_x,_y,title,items) => { menu = {title,items}; },
    navigator:{clipboard:{writeText:async text => { if (copyFails) throw Error('Clipboard denied'); copied = text; }}},
    api:{
      checkUpdate:async () => status,
      applyUpdate:async () => { calls++; return release ? new Promise(resolve => { release = resolve; }) : result; },
      onUpdateStep:() => { if (subscriptionFails) throw Error('Disconnected'); return () => { removed++; if (cleanupFails) throw Error('Closed'); }; },
    },
  };
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(source.slice(start,end), {mode:'transform'}) + '\nthis.check = checkUpdate;', context);
  await context.check();
  await button.click();
  assert.equal(button.textContent, 'Changes not ready');
  assert.equal(button.disabled, false);
  assert.equal(menu.title, failure.error);
  assert.equal(button.title, failure.error);
  await menu.items[0].run();
  assert.equal(copied, compiler, 'Exact diagnostic output remains available on request');
  await context.check();
  assert.equal(button.textContent, 'Changes not ready', 'Polling cannot hide a failed validation');
  copyFails = true;
  await menu.items[0].run();
  assert.match(menu.title, /Could not copy/);
  copyFails = false;

  result = {ok:true}; release = true;
  const pending = button.click();
  assert.equal(button.disabled, true);
  const before = calls;
  await button.click(); await context.check();
  assert.equal(calls, before, 'Repeated clicks do not submit another update');
  release({ok:true}); release = null;
  await pending;
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Check updates');
  assert.equal(button.title, "You're up to date");
  assert.equal(removed, 2);

  subscriptionFails = true;
  await button.click();
  assert.equal(button.disabled, false, 'A disconnected step subscription releases the button');
  subscriptionFails = false; cleanupFails = true;
  await button.click();
  assert.equal(button.disabled, false, 'Failed listener cleanup releases the button');
  cleanupFails = false; result = failure;
  await button.click();
  status = {available:false};
  await context.check();
  assert.equal(button.textContent, 'Check updates', 'A current installed build clears obsolete failure feedback');
  console.log('Update feedback: concise errors, exact copyable details, retained failure state, retry, duplicate clicks and listener cleanup passed.');
}
module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
