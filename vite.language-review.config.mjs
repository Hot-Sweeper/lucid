import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{target:'esnext',outDir:'language-review',emptyOutDir:true,rollupOptions:{input:'scripts/language-review.html'}}});
