import { build, mergeConfig } from 'vite';
import config from '../vite.config.mjs';
const out = process.argv[2];
if (!out) throw Error('Output required');
await build(mergeConfig(config,{build:{outDir:out},plugins:[{name:'newly-captured-pre-fix-activity-baseline',enforce:'pre',transform(code,id){
if(!id.endsWith('/src/director.ts'))return;
return code.replace('if (initial && !this.info) { this.pendingInitial = items; return; }','')
.replace('if (initial) latestRun = this.info?.run?.status === "running" ? this.info.run.id : null;','if (initial) latestRun = [...items].reverse().find((i) => i.runId)?.runId ?? null;')
.replace('if (initial && (!latestRun || it.runId !== latestRun))','if (initial && it.runId !== latestRun)');
}}]}));
