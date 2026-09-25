# Generation Loss

*an exhibition of glitch art in eight generations*

**[▶ Play it in your browser](https://amberxplorer.github.io/opus5.5-glitch/)**

A two-minute audiovisual piece. One photograph of the Earth, the Blue Marble taken by the crew
of Apollo 17 in 1972, is copied from one medium to the next. Each generation starts from what
the one before it left, and each loses something. At the end the whole planet is averaged down
to a single pixel, and that pixel turns out to be the Earth in Voyager 1's *Pale Blue Dot*.

The sound goes through the same eight media. A four-bar loop plays fourteen times, and each
time it is a real copy of the copy before. Every picture is drawn and every sound is synthesized
in the browser as it plays.

Open `index.html` in a browser with WebGL 2, then click, tap or press Enter. Headphones help.

| key | does |
| --- | --- |
| Enter / click | play (and play again after the end) |
| Space | pause / resume |
| F | fullscreen |
| ← / → | seek 5 s |
| R | restart |

## The eight generations

| | time | picture | sound |
| --- | --- | --- | --- |
| 0 · Download | 0:00 | a test card with the title; the modem dials, shakes hands and fetches `as17-148-22727.jpg`, which appears band by band with grey where the data has not arrived | a 1 kHz line-up tone; the dial (the digits spell GENERATION on a keypad); a V.34 handshake; the data |
| 1 · Bit Rot | 0:08 | single bits of the JPEG file are flipped, one at a time and then faster; a hex dump follows each one. Two flips land in the quantisation tables and change the whole planet at once | the loop, first as recorded, then through a lossy codec with a few bit errors; each flipped bit chirps |
| 2 · Pixel Sort | 0:24 | the bright spans of the damaged picture are sorted by brightness, down and then sideways, until the clouds run (after Kim Asendorf) | the loop with its samples sorted in short windows; sorting noise into rising tones |
| 3 · Datamosh | 0:40 | predicted frames with no key frame: blocks are moved by motion vectors taken from another clip, and the kicks push them outward (after Takeshi Murata's *Monster Movie*) | the loop in misplaced grains; stutters |
| 4 · Broadcast | 0:56 | the moshed picture on a picture tube: composite video, a VCR's display, tracking errors, and a magnet that twists the image (after Nam June Paik's *Magnet TV*); the tube switches off | the loop on tape, copied twice; mains hum, the 15.7 kHz line whistle; the magnet bends the pitch; a tape stop |
| 5 · Spectrum | 1:12 | a spectrogram of the soundtrack, computed as it plays. The Earth appears in it | the Earth played as sound: 171 harmonics of E♭1, one per column, rows from the bottom up (after Aphex Twin) |
| 6 · Compression | 1:28 | that spectrogram saved as a JPEG again and again, every eighth and then every sixteenth note, at falling quality, until only blocks are left | the loop crushed to five bits at 8 kHz; the climax |
| 7 · One Pixel | 1:44 | the blocks averaged: 8, 16, 48, 144, then all 518,400 pixels in one colour. It shrinks to a pixel, and the pixel is the Earth in the *Pale Blue Dot*. The file ends at its last two bytes, `ff d9` | the loop played into a room until only the room's resonances are left (after Alvin Lucier); then the loop as it first was, until the file ends |

## The loop and its copies

The loop is four bars at 120 bpm: E♭maj9, Gm7, Cm9, A♭maj7♯11, on an FM electric piano, a
music box and a soft pad. It is rendered once. After that every repetition is processed from the
previous one, never from the original:

| copies | made by |
| --- | --- |
| 1 | a perceptual codec: bands quantised to a few levels, quiet bins dropped, the top cut; a handful of single-bit errors in the 16-bit samples |
| 2–3 | sorting the samples inside short windows, which turns them into buzzing ramps |
| 4–5 | moving grains to the wrong places, as motion vectors move blocks |
| 6–7 | tape: wow and flutter, saturation, a head bump, lost treble, hiss, a dropout |
| 8–9 | radio: a 280–3300 Hz band, slow fading, crackle |
| 10–11 | a bit-crusher (7 bits, then 5; half, then a quarter of the sample rate), and the codec at its worst |
| 12–13 | a room tuned to E♭, G, B♭, D and F: the loop is played into it 4 and then 16 times, until only the room is left |

The copies are made at 32,768 Hz, so the loop is exactly 2¹⁸ samples long and every process,
including the room, can treat it as circular: nothing clicks where the loop joins itself. You can
see each copy lose something in the spectrogram (`node tools/audio.mjs`).

## The photographs

- **The Blue Marble**, AS17-148-22727, taken by the crew of Apollo 17 on 7 December 1972.
  NASA, public domain. Source: <https://images.nasa.gov/details/as17-148-22727>.
- **Pale Blue Dot**, PIA00452, taken by Voyager 1 on 14 February 1990 from about six billion
  kilometres. NASA/JPL, public domain. The Earth is the pale speck in the right-hand sunbeam,
  0.12 of a pixel in the original camera.

Both are re-encoded by our own JPEG encoder (`tools/prep.mjs`), so every byte the piece damages is
one it wrote.

## How it works

- **A JPEG codec written to be broken** (`src/jpeg.js`). A baseline encoder and a decoder that
  fails the way libjpeg does. A damaged bit decodes as garbage until the next restart marker. A
  stray marker, or data that has not arrived yet, decodes as grey. Damaged tables are used as found. The
  Earth is encoded with a restart marker every row of blocks, so a flipped bit costs one
  re-decoded band (about a millisecond), and a lost marker makes everything below it slide up.
  Our own decoder means every browser breaks the picture in exactly the same way.
- **Stages** (`src/stages.js`, `src/shaders.js`). WebGL 2 passes on a work canvas in which the
  picture's square is always 720 pixels:
  - **Pixel sort:** odd–even transposition.
  - **Datamosh:** 16 × 16 motion-compensated blocks.
  - **Broadcast:** a YIQ composite-video model.
  - **Compression:** an 8 × 8 DCT with the standard tables, in five passes per save.
  - **One pixel:** a reduction to block means.

  The processes that carry state step at fixed rates, so a video rendered frame by frame and a
  live performance show the same pictures.
- **The spectrogram** is read from the soundtrack itself, 72 rows a second, with the same FFT
  the synthesizer uses. The Earth in it is really in the sound.
- **Sound** (`src/synth.js`). A sample-level synthesizer renders the whole track in a Web Worker
  while the test card is up. It includes the loop instruments, the generation processes, drums,
  a sine bass, the DTMF dial and modem handshake, the additive voice that plays the picture, a
  plate reverb and a look-ahead limiter. It returns envelopes and the score, so the picture moves
  with the actual notes.
- **Words** (`src/hud.js`, `src/card.js`). The test card is drawn once per screen size. The
  labels, timecode, terminal, hex dump and axes are on a separate canvas, so they stay sharp.

## Building and checking

`index.html` is generated; edit `src/` and run `node build.mjs`.

- `node tools/prep.mjs <as17-148-22727~orig.jpg> <Pale_Blue_Dot.png>` re-makes `src/media.js`
  and `src/spectral.js` from the two public-domain originals.
- `node tools/audio.mjs [dir]` renders the track in Node. It writes `track.wav`, a spectrogram
  of the whole piece and `waterfall.png` (the Earth in the sound), and prints levels per
  generation and per instrument.
- `node tools/shoot.mjs <dir> 720x1280 sheet:12,44,80 [fontDir]` captures frames headlessly.
- `node tools/video.mjs out.mp4 track.wav 720x1280 30 [fontDir]` renders an MP4 frame by frame,
  muxed with the WAV.
- `node tools/play.mjs <seconds> [startAt] [fontDir] [WxH]` plays the page for real in headless
  Chromium and reports the clock and any console errors.

The type is Instrument Sans and IBM Plex Mono from Google Fonts. Without a network connection
the page falls back to system fonts.

## The works it quotes

- Kim Asendorf, *Mountain Tour* and the ASDFPixelSort scripts (2010), for pixel sorting.
- Takeshi Murata, *Monster Movie* (2005), for datamoshing.
- Nam June Paik, *Magnet TV* (1965).
- Aphex Twin, the face hidden in the spectrogram of the *Windowlicker* single (1999).
- Alvin Lucier, *I Am Sitting in a Room* (1969), for the room.
- William Basinski, *The Disintegration Loops* (2002–03), for a loop that falls apart as it plays.
- Rosa Menkman, *The Glitch Moment(um)* (2011), on the beauty of the broken file.
- Carl Sagan's request that Voyager 1 turn round and photograph the Earth (1990).
