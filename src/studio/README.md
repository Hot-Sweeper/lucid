# Website build playback engine

`stage-engine.mjs` is kept unchanged from the removed Website Studio prototype, so a later
feature can let robots visibly build websites on their screens. Nothing imports it yet.

It compares each newly saved render of a page with the previous one and plays the change back
the way a person builds a page in a design tool: boxes are drawn and filled, text is typed in,
images are dropped and scaled, removed parts are selected and deleted. It reconstructs from saved
renders, never from recorded input. `stage-engine.css` holds the styles it needs (cursor,
overlay, guides, frame).

To run it, a host page provides this structure and loads both files:

```html
<main class="stage is-empty">
  <div class="frame-holder"></div>
  <div class="overlay"></div>
  <div class="empty"><div class="empty-inner"><p class="empty-line"></p></div></div>
</main>
```

```js
import { Stage } from './stage-engine.mjs';
const stage = new Stage({ stage, holder, overlay, onReady, onFollowChange });
await stage.openProject('current', { hasSite: true, version });
stage.update(nextVersion); // plays the change to the next saved render
```

The engine fetches the current render from `/__lucid/frame`, so the host must serve each saved
page there. It also exposes `setViewport('desktop' | 'tablet' | 'phone')`, `setFollow`,
`setWorking`, `setModelName`, `replay`, `reload`, `cancel` and `destroy`.
