import {defineConfig} from 'vite';
const before=process.env.LUCID_BOTSAPP_BEFORE==='1';
export default defineConfig({base:'./',plugins:[{
  name:'botsapp-focused-review',enforce:'pre',transform(source,id){
    if(!id.replaceAll('\\','/').endsWith('/src/social/botsapp.ts'))return;
    if(before)source=source.replace(/this\.stopName\(\);\s*this\.stopName = followConversationName\(this\.headName, c\.el!\.querySelector<HTMLElement>\("b"\)!\);/,'this.headName.textContent = c.name;');
    return source+'\nexport {BotsApp};';
  }
}],build:{target:'esnext',outDir:before?'botsapp-review-before':'botsapp-review',emptyOutDir:true,rollupOptions:{input:'scripts/botsapp-name-review.html'}}});
