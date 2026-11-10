# Third-party notices

The app's own code, artwork and music are MIT licensed ([LICENSE](LICENSE)). It also ships or
was made with the third-party work below. Installed builds additionally contain Electron and
Chromium, whose licenses are bundled with every build as `LICENSE.electron.txt` and
`LICENSES.chromium.html`.

## Fonts

Bundled into the app through Fontsource.

- **Lexend** (interface font). Copyright 2019 The Lexend Project Authors
  (https://github.com/googlefonts/lexend). SIL Open Font License 1.1.
- **JetBrains Mono** (code font). Copyright 2020 The JetBrains Mono Project Authors
  (https://github.com/JetBrains/JetBrainsMono). SIL Open Font License 1.1.

The full license text follows at the end of this file.

## Libraries bundled into the app

- **GSAP** (animation), https://gsap.com. Not open source: it is distributed under Webflow's
  [Standard "No Charge" GSAP License](https://gsap.com/standard-license), which allows free use,
  including commercial use, in websites, web applications and digital interfaces. It forbids
  using GSAP in tools that let users build visual animations without code in competition with
  Webflow, and removing its notices. This app is not such a tool. The GSAP files are not covered
  by this project's MIT license; forks must follow GSAP's own terms.
- **DOMPurify** (HTML sanitizing), Copyright Dr.-Ing. Mario Heiderich, Cure53. Dual licensed
  under the Mozilla Public License 2.0 or the Apache License 2.0; used here under Apache 2.0.
  https://github.com/cure53/DOMPurify
- **marked** (Markdown), MIT. License text below.
- **electron-updater** and its dependencies (installed builds only), MIT,
  Copyright (c) 2015 Loopline Systems. https://github.com/electron-userland/electron-builder

## T3 Code theme palettes

`electron/t3-theme-builtins.cjs` contains the colours of T3 Code's built-in themes, copied from
the T3 Code web client so the "Follow T3" theme can show them. T3 Code is MIT licensed:
https://github.com/pingdotgg/t3code. Thanks to the T3 Code authors.

## Music

All 51 songs and the room ambience in `src/assets/audio` are original compositions written for
this app and rendered offline with the tools in `tools/music`. No recording, loop or excerpt of
anyone else's music is included. The app ships only the rendered recordings; the sample
libraries below are authoring inputs and are not redistributed. They are credited because the
recordings are performed with them:

- **Salamander Grand Piano V3** by Alexander Holm, Creative Commons Attribution 3.0
  (https://creativecommons.org/licenses/by/3.0/).
- **jRhodes3d** Rhodes Mark I samples by Jeff Learman, released free for any use.
- **E-Pianos** (Wurlitzer EP200, Yamaha CP80) sample sets by Greg Sullivan, free releases.
- **Karoryfer Sneakybass** and **Karoryfer x Bigcat cello** by Karoryfer Samples, CC0.
- **Virtuosity Drums**, CC0.
- **VCSL** (Versilian Community Sample Library) by Sam Gossner and contributors, CC0
  (https://github.com/sgossner/VCSL). License text: `docs/licenses/VCSL-CC0.txt`.
- **FluidR3 GM** SoundFont by Frank Wen and contributors, MIT. Notice:
  `docs/licenses/FluidR3-GM.txt`.
- **Surge XT** 1.3.4 synthesizer and its factory and third-party patches, GPL-3.0
  (https://surge-synthesizer.github.io). Used as an instrument; the synthesizer is not shipped.
- **Pedalboard** by Spotify (GPL-3.0), **FluidSynth** (LGPL-2.1), FFmpeg and libopus were used as
  offline processing and encoding tools and are not shipped.

## Logos of real tools

The robots use real tools, so the app shows those tools' names and logos to identify them:
Claude, Codex and OpenAI, GitHub Copilot, Cursor, Gemini, Grok, Amp, Antigravity, Hermes (Nous
Research), Meta, OpenClaw, opencode, Pi (`src/assets/*.svg`, `src/assets/harness/`). Several of
these vector marks come from the Simple Icons and LobeHub icon collections. The note app icons in
`src/assets/note-apps/` (Apple Notes, Windows Notepad, Notepad++) are listed with their sources
in `src/assets/note-apps/sources.json`. All of these names and logos are trademarks of their
owners. Their use does not imply endorsement, and they are not covered by this project's MIT
license.

## License texts

### SIL Open Font License 1.1 (Lexend, JetBrains Mono)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

### marked

# License information

## Contribution License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## Marked

Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Markdown

Copyright © 2004, John Gruber
http://daringfireball.net/
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name “Markdown” nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors “as is” and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed. In no event shall the copyright owner or contributors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.
