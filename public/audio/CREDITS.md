# Audio credits

All clips come from **Adobe "Aero Audio Starter Assets"**, a shared Creative Cloud library on the
developer's Mac (`~/Library/Application Support/Adobe/Creative Cloud Libraries/LIBS/…/collaborated/dcx/92ade164-3931-4dea-a894-42ca3eb94e5d/components/`).
Matched to library names by the MD5 checksums in the library manifest.

| Game sound | Library clip | Source file | Processing |
|---|---|---|---|
| `chime` (coin pickup; pitch rises per coin in code) | Crystal 01 (`electronics_crystal_01_ar`, 4.85 s) | `b9515616-e3a7-4e47-b60a-9c433df33163.mp3` | first 1.2 s, 0.45 s fade-out, mono, peak −3 dBFS |
| `boing` (beanbag bounce) | Bubble pop (`home_&_household_bubble_pop_ar`, 0.22 s) | `4c81d9dc-151e-4bc9-92ed-e9652aedc3a5.mp3` | leading silence trimmed, mono, peak −3 dBFS |
| `thud` (book hits the floor) | Thud (`toys_thud_ar`, 0.72 s) | `c2bf02a3-e171-47b7-8b9d-fd3c24e055ff.mp3` | first 0.45 s, 0.15 s fade-out, mono, peak −3 dBFS |
| `win` (all 11 coins) | Shimmer 01 (`electronics_shimmer_ar`, 1.63 s) | `fc91b1ec-e0e5-4637-8687-dc5ad0473e79.mp3` | full clip, 0.35 s fade-out, mono, peak −3 dBFS |

Each is encoded as `.mp3` (96 kbps) and `.ogg` (Opus 64 kbps); each is under 20 KB (limit 50 KB).

**Not from files:** the background music loop and footsteps are generated with Web Audio in
`src/audio/sfx.ts` (no music MP3 exists on the Mac).

**Licence — check before going public.** None of these are commercially released music. They are
Adobe starter assets provided for Adobe Aero projects; whether that licence covers a public
website/game has not been verified.
