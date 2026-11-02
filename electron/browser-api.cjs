// Explicit browser capabilities. Never expose arbitrary IPC channel names over HTTP.
const lucid = {
  localize:'lucid:localize', projects:'t3:projects', threads:'t3:threads', watchSet:'t3:watch-set', office:'t3:office', offices:'t3:offices', world:'t3:world',
  environments:'environment:list', selectEnvironment:'environment:select', tasks:'t3:tasks', addProject:'project:add', removeProject:'project:remove',
  host:'app:host', usage:'usage:get', coinUsage:'coins:usage', weather:'weather:get', saveAttachment:'attach:save',
  conversation:'t3:conversation', conversationPage:'t3:conversation-page', pendingRequests:'t3:pending-requests', requestOutcome:'t3:request-outcome', itemsSince:'t3:items-since', threadInfo:'t3:thread-info', attachDir:'t3:attach-dir', startThread:'t3:start', sendMessage:'t3:send',
  requestContext:'t3:request-context', repliesSince:'t3:replies-since', resolvedSince:'t3:resolved-since', userMessagesSince:'t3:user-messages',
  approvalPapers:'orch:approval-papers', reportsList:'reports:list', reportsManual:'reports:manual', orchMemory:'orch:memory', orchDialogs:'orch:dialogs', orchAnswers:'orch:answers', orchDecisions:'orch:decisions',
  peek:'web:peek', shot:'web:shot', frontendFrame:'frontend:frame', siteFetch:'site:fetch', webSearch:'web:search', gitInfo:'git:info', image:'fs:image', readText:'fs:text', version:'app:version',
};
const lucidT3 = Object.fromEntries(['manager','managerSuggest','managerAvatar','managerAvatarHistory','managerAvatarAsk','status','providers','hireConfig','hireContexts','reorder','moveThread','cancel','edit','steer','setModel','respond'].map(name => [name, 't3s:' + ({managerSuggest:'manager-suggest',managerAvatar:'manager-avatar',managerAvatarHistory:'manager-avatar-history',managerAvatarAsk:'manager-avatar-ask',hireConfig:'hire-config',hireContexts:'hire-contexts',moveThread:'move-thread'}[name] || name)]));
module.exports = { lucid, lucidT3, lucidMarket: { klines:'market:klines',price:'market:price' }, lucidDocs: {read:'doc:read'} };
