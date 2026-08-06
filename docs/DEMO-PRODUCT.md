# Demo Product Contract

**Status:** Active product definition for `main`  
**Map:** `maps/ladder/Garden of war BNE.pud.smp.gz`  
**Match:** Human (player 0) vs computer (player 1) fixed browser demo

## In scope

- Load the fixed Garden of war demo into a playable browser session
- Harvest / economy basics, train and build enough for a match, combat
- AI pressure sufficient for a ladder-style skirmish
- Victory by defeating the enemy (existing fixed-demo victory semantics)
- HUD, commands, audio, and cursors needed for that loop
- Short demo verification gate (`npm run verify` / `npm run verify:demo`)
- Performance and polish of **this** match only

## Out of scope (until explicit product expansion)

- Other maps, campaigns, multi-mission progression
- Full Wargus source UI / source-button parity as default gates
- Full unit, tech, naval, oil, and spell surface beyond what the demo uses
- Default multi-profile successor performance matrix as standing work
- Active execution of historical Plans 001–027 as a living roadmap
- Re-expanding default verify to full-port fidelity

## Expanding scope later

1. Explicit user decision  
2. Update this file and `docs/ARCHIVE.md`  
3. Lift code from `archive/full-port` (see lift recipe)  
4. Add demo-scoped tests only; do not restore full-port default gates unless decided  
