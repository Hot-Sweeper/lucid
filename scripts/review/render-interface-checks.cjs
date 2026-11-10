// Reversible interface checks in the isolated fixture. Never submits a task or chat.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ js, wc, wait, out }) => {
  const result = {}, check = (ok, message) => { if (!ok) throw Error(message); };
  const shot = async name => fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
  try {
    result.initial = await js(`{const c=window.__chat;({collapsed:c.collapsed,railWidth:c.tab.getBoundingClientRect().width,extras:!!document.getElementById('side-settings'),search:!!document.getElementById('th-q')})}`);
    check(result.initial.collapsed && Math.abs(result.initial.railWidth-64)<1 && result.initial.extras && result.initial.search, 'Collapsed conversation rail or sidebar disclosure is missing');
    await shot('interface-collapsed');
    await js(`{const c=window.__chat,d=window.__world.desks.get('perf-t0');window.__interfaceDesk=d;c.open(d);c.el.querySelector('textarea').value='Draft kept: exact Unicode 🎵'}`);
    await wait(400);
    result.open = await js(`{const c=window.__chat;({open:c.isOpen,collapsed:c.collapsed,width:c.el.getBoundingClientRect().width,thread:c.threadId})}`);
    check(result.open.open && !result.open.collapsed && result.open.width>=300 && result.open.thread==='perf-t0', 'Choosing a desk did not open its conversation');
    await js(`window.__world.scene.dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
    result.backgroundFold = await js(`window.__chat.collapsed`);
    check(!result.backgroundFold, 'Office background click folded the conversation');
    await js(`window.__world.unfocus()`);
    check(await js(`!window.__chat.collapsed`), 'Leaving desk focus folded the conversation');
    await js(`window.__chat.el.querySelector('.cp-hide').click()`);
    check(await js(`window.__chat.collapsed`), 'Manual hide did not fold the conversation');
    await js(`window.__chat.open(window.__interfaceDesk)`);
    result.draft = await js(`window.__chat.el.querySelector('textarea').value`);
    check(result.draft==='Draft kept: exact Unicode 🎵', 'Folding the conversation lost the draft');
    await shot('interface-expanded');
    await js(`window.__chat.close()`);
    await wait(350);
    await js(`window.__chat.tab.click()`);
    result.emptyRail = await js(`({focused:document.activeElement===document.getElementById('th-q'),logoHidden:window.__chat.tab.querySelector('img').hidden})`);
    check(result.emptyRail.focused && result.emptyRail.logoHidden, 'Empty rail did not focus thread search or clear conversation identity');
    await js(`{const w=window.__world,d=window.__interfaceDesk;w.onFreeDesk(d,d.room+'#0',20,20)}`);
    await wait(200);
    result.hire = await js(`{const form=document.querySelector('.hire'),task=form?.querySelector('.hire-task textarea'),role=form?.querySelector('.rn-brief');({exists:!!form,taskFocused:task===document.activeElement,roleHidden:!!role&&role.getBoundingClientRect().height===0})}`);
    check(result.hire.exists && result.hire.taskFocused && result.hire.roleHidden, 'Hire did not focus the visible Task field');
    // Both fields are empty. Production validation must stay in the dialog, with no API call.
    await js(`document.querySelector('.hire').requestSubmit()`);
    result.hireValidation = await js(`{const form=document.querySelector('.hire');({open:!!form,taskFocused:form?.querySelector('.hire-task textarea')===document.activeElement})}`);
    check(result.hireValidation.open && result.hireValidation.taskFocused, 'Empty-task validation did not retain focus in Task');
    await shot('interface-hire-task');
    await js(`document.querySelector('.hire [data-a="cancel"]').click()`);
    result.errors = await js(`window.__errs`);
    check(!result.errors.length, 'Interface checks produced renderer errors');
    result.passed = true;
  } catch (error) { result.error=String(error);throw error; }
  finally {
    await js(`{document.querySelector('.hire [data-a="cancel"]')?.click();window.__chat.close();delete window.__interfaceDesk}`).catch(()=>{});
    fs.writeFileSync(path.join(out, 'interface-checks.json'),JSON.stringify(result,null,2));
  }
  console.log('interfaceChecks',JSON.stringify(result));
};
