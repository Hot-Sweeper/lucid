import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/office/chat-media.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source, 'chat-media.ts')).code.replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
const media = new Function(`${code};return {localMediaPath,chatFileUrl,chatMediaSource,chatMediaKind,inlineChatImage}`)();
const path = 'E:/T3 Projects/Lucid/image #1 (ä) 50%.png';
for (const value of [path, `/${path}`, `file:///${encodeURI(path).replace('#', '%23')}`, media.chatFileUrl(path)]) {
  assert.equal(media.localMediaPath(value), path, value);
  assert.equal(media.chatMediaSource(value), `lucid-file://local/${encodeURIComponent(path)}`);
}
assert.equal(media.localMediaPath('C:\\Pictures\\image.png'), 'C:\\Pictures\\image.png');
assert.equal(media.localMediaPath('file://nas/share/picture%20one.png'), '//nas/share/picture one.png');
assert.equal(media.localMediaPath('/home/user/image.png'), '/home/user/image.png');
assert.equal(media.chatMediaKind('https://example.com/photo.PNG?size=2#view'), 'image');
assert.equal(media.chatMediaKind('C:/picture#2.png'), 'image');
assert.equal(media.chatMediaKind('clip.webm'), 'video');
assert.equal(media.chatMediaKind('voice.wav'), 'audio');
assert.equal(media.chatMediaKind('download', 'image/png'), 'image');
assert.equal(media.chatMediaSource('https://example.com/image.png'), 'https://example.com/image.png');
assert.equal(media.chatMediaSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:bad', 'https://user:secret@example.com/image.png', 'lucid-file://local/%ZZ', 'C:/bad\u0000.png', '//untrusted/image.png']) assert.equal(media.chatMediaSource(value), null, value);
const unsafeLabel = '<img src=x onerror=alert(1)>"';
const html = media.inlineChatImage(path, unsafeLabel);
assert(!html.includes('<img src=x'));
assert(html.includes('&lt;img') && html.includes('type="button"') && html.includes('data-media-kind="image"'));
assert(media.inlineChatImage('https://example.com/clip.mp4', 'Clip').includes('Open video'));
assert(media.inlineChatImage('javascript:alert(1)', 'Missing').includes('Image unavailable'));
globalThis.window = { lucidRemote: true };
assert.equal(media.chatMediaSource(path), `/__lucid/media/${encodeURIComponent(path)}`);
assert.equal(media.chatMediaSource(`lucid-file://local/${encodeURIComponent(path)}`), `/__lucid/media/${encodeURIComponent(path)}`);
delete globalThis.window;
console.log('Chat media paths passed: Windows/file/UNC/POSIX, special characters, media types, remote companion routing and rejected unsafe sources.');
