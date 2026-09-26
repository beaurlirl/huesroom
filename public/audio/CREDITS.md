# Audio credits

| File | What | Source | Processing |
|---|---|---|---|
| `music.mp3` / `music.ogg` | Background music, track 1 (full song) | The owner's own track, made in GarageBand (GarageBand, 4:05) | Loudness-normalised to −18 LUFS (−2 dBTP); MP3 128 kbps and Opus 96 kbps; streamed, not decoded |
| `riff.mp3` / `riff.ogg` | Background music, track 2 (first 130 s) | The owner's own track "ianrifffffff" (GarageBand, 3:06) | First 130 s, 2 s fade-out, loudness-normalised to −18 LUFS; MP3 128 kbps and Opus 96 kbps |

The two tracks play in order and repeat.

Sound effects (coin chime, beanbag boing, book/can thud, win jingle) are generated live with
Web Audio in `src/audio/sfx.ts` until the owner's own clips are added (list them in
`AUDIO_FILES` there and in this table).

(An earlier build used Adobe "Aero Audio Starter Assets" clips; they were removed at the
owner's request.)
