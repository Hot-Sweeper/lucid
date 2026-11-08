// Real Chromium decoding/routing check in an isolated, inaudible Electron fixture.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true })
    .on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const { stripTypeScriptTypes } = require('node:module');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-audio-check-'));
  app.setPath('userData', path.join(directory, 'profile'));
  const timeout = setTimeout(() => { console.error('Native audio check timed out'); app.exit(1); }, 40000);
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, autoplayPolicy: 'user-gesture-required' } });
    try {
      const queue = fs.readFileSync('src/office/soundtrack-queue.ts', 'utf8');
      const catalogue = fs.readFileSync('src/office/soundtrack.ts', 'utf8')
        .replace(/^import (\w+) from '([^']+)';$/gm, (_, name, relative) =>
          `const ${name} = ${JSON.stringify(pathToFileURL(path.resolve('src/office', relative)).href)};`)
        .replace(/^import type .*;$/gm, '');
      const engine = fs.readFileSync(path.resolve('src/office/sound.ts'), 'utf8')
        .replace(/^import (\w+) from '([^']+)';$/gm, (_, name, relative) =>
          `const ${name} = ${JSON.stringify(pathToFileURL(path.resolve('src/office', relative)).href)};`)
        .replace(/^import .*;$/gm, '');
      const source = (queue + '\n' + catalogue + '\n' + engine).replace(/export /g, '');
      fs.writeFileSync(path.join(directory, 'sound.js'), stripTypeScriptTypes(source, { mode: 'transform' }) + '\nwindow.sound = gameSound;');
      fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><title>Audio verification</title><script src="sound.js"></script>');
      await win.loadFile(path.join(directory, 'index.html'));
      const result = await win.webContents.executeJavaScript(`(async () => {
        const assert = (condition, message) => { if (!condition) throw Error(message); };
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (fn, message) => { for (let i=0;i<100;i++) { if(fn()) return; await wait(40); } throw Error(message); };
        assert(!sound.context && sound.background.size === 0, 'startup must stay locked');
        // Synthetic authorization is fixture-only; production still requires isTrusted.
        sound.gesture({isTrusted:true});
        const ctx = sound.context;
        const output = ctx.createGain(); output.gain.value = 0;
        sound.master.disconnect(); sound.master.connect(output); output.connect(ctx.destination);
        await until(() => sound.background.size === 2 && [...sound.background.values()].every(t => !t.pending && !t.media.paused && t.media.currentTime > .1), 'local media did not decode/play');
        const tracks = [...sound.background.values()];
        const analysers = tracks.map(track => { const a=ctx.createAnalyser(); a.fftSize=2048; track.gain.connect(a); a.connect(output); return a; });
        await wait(350);
        const metrics = tracks.map((track, i) => { const data=new Float32Array(2048); analysers[i].getFloatTimeDomainData(data); return {duration:track.media.duration, position:track.media.currentTime, rms:Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length), loop:track.media.loop}; });
        assert(metrics.every(m => m.rms > .00001) && !metrics[0].loop && metrics[1].loop, 'songs stream through the shared graph while only air loops');
        assert(metrics[0].duration > 90 && metrics[0].duration < 200 && metrics[1].duration > 40, 'unexpected packaged asset duration');
        // One actual ended event verifies automatic song-boundary rotation.
        const first = sound.currentTheme.id;
        tracks[0].media.currentTime=tracks[0].media.duration-.12;
        await until(()=>sound.currentTheme.id!==first&&!tracks[0].pending&&!tracks[0].media.paused&&tracks[0].media.currentTime>.12,'next song did not decode or advance');
        const next = sound.currentTheme.id;
        sound.configureMusic('phonk');
        assert(sound.currentTheme.id===next,'genre changes must finish the current composition');
        sound.nextTheme();
        await until(()=>sound.currentTheme.genre==='phonk'&&!tracks[0].pending&&!tracks[0].media.paused,'manual Next must apply the chosen genre');
        const position = tracks[0].media.currentTime;
        sound.pauseTheme(true); await wait(150);
        assert(tracks[0].media.paused&&Math.abs(tracks[0].media.currentTime-position)<.1&&!tracks[1].media.paused,'music pause preserves its playhead independently');
        sound.pauseTheme(false);
        await until(()=>!tracks[0].pending&&!tracks[0].media.paused,'music resume must keep the song');
        sound.pauseTheme(true);
        // Codec coverage is separate from journey sequencing. Reuse the real
        // theme media/source/gain, seek to an audible passage, decode every file.
        // Seeking deliberately does not stand in for actual listening time.
        const songs = [];
        for(const song of SOUNDTRACK) {
          tracks[0].media.pause(); tracks[0].media.src=song.url;
          tracks[0].gain.gain.cancelScheduledValues(ctx.currentTime);
          tracks[0].gain.gain.setValueAtTime(.5,ctx.currentTime);
          await tracks[0].media.play();
          await until(()=>Number.isFinite(tracks[0].media.duration)&&tracks[0].media.duration>90,'catalogue asset did not decode');
          tracks[0].media.currentTime=20;
          await until(()=>tracks[0].media.currentTime>20.1,'decoded file did not play');
          await wait(160);
          const data=new Float32Array(2048);analysers[0].getFloatTimeDomainData(data);
          const rms=Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);
          assert(rms>.00001,'every packaged recording must produce a real decoded signal');
          songs.push({id:song.id,duration:tracks[0].media.duration,rms});
        }
        tracks[0].media.pause(); sound.pauseTheme(false);
        await until(()=>!tracks[0].pending&&!tracks[0].media.paused,'engine playback must resume after codec coverage');
        assert(sound.background.size===2,'rotation must not grow the streaming source pool');
        tracks[1].media.currentTime=tracks[1].media.duration-.12;await wait(650);
        assert(!tracks[1].media.paused&&tracks[1].media.currentTime<2,'room air still loops independently');
        sound.configure(false); assert(tracks.every(t => t.media.paused), 'mute must pause streams');
        sound.configure(true); await until(() => tracks.every(t => !t.media.paused), 'unmute must resume');
        sound.configureBackground('theme', 0); assert(tracks[0].media.paused && !tracks[1].media.paused, 'independent layer control');
        sound.destroy();
        assert(tracks.every(t => t.media.paused && !t.media.getAttribute('src')), 'teardown must release media');
        for(const a of analysers) a.disconnect(); output.disconnect();
        return {metrics, songs, songBoundaryRotation:true, fullLibraryDecoded:true, genreControls:true, independentPause:true, ambienceLooping:true, muteAndResume:true, independentLevels:true, cleanup:true, listeningTest:false};
      })()`, true);
      console.log('PASS: native Chromium decoding of the full soundtrack, nonzero signal, real ended-event rotation, deferred genre selection, independent music pause, ambience loop, controls and teardown.');
      fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
      console.log('Evidence: ' + directory);
      console.log(JSON.stringify(result, null, 2));
      clearTimeout(timeout); win.destroy(); app.exit(0);
    } catch (error) { console.error(error); clearTimeout(timeout); win.destroy(); app.exit(1); }
  });
}
