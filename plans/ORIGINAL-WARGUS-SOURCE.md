# Original Wargus Source Of Truth

When the TypeScript port, a roadmap step, or a verifier is ambiguous, resolve
the behavior in this order:

1. Observe the installed Wargus game.
2. Read the matching installed Wargus scripts and Stratagus engine source.
3. Read the upstream Wargus/Stratagus repositories for clarification or newer
   fixes that do not contradict the installed behavior.
4. Treat the TypeScript port's existing behavior as authoritative only when the
   original game has no equivalent mechanic.

## Installed runtime

- Launcher: `/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/launch-wargus.sh`
- Runtime root: `/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local`
- Game command: `games/stratagus -d share/games/stratagus/wargus -W`
- Installed engine: Stratagus `v3.3.3-git3526da2a93b253394e28fff8d3546146e256328b`

## Installed source

- Wargus scripts: `/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus`
- Wargus commit: `409a36f7da7b6a162e3f465d98619db9a9d77cbf`
- Stratagus engine: `/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src`
- Stratagus commit: `b3b4babe8eb8f908ac9cb25da9c0fd83c67957c5`
- The local Stratagus checkout has pre-existing user changes in
  `src/stratagus/mainloop.cpp` and `src/unit/script_unit.cpp`. Read them when
  needed; never modify or reset that checkout from this project.

## Upstream

- Wargus: https://github.com/Wargus/wargus
- Stratagus: https://github.com/Wargus/stratagus

## Recording a ruling

When original behavior changes an implementation choice, record the runtime
observation or exact source file/lines in the plan evidence packet. Do not copy
large Lua/C++ blocks into this repository; cite the installed path and commit.

Confirmed production graph at the installed Wargus commit:

- Human Barracks trains Ballista.
- Orc Barracks trains Catapult.
- Gnomish Inventor trains Flying Machine and Dwarves.
- Goblin Alchemist trains Zeppelin and Goblin Sappers.

Confirmed construction lifecycle at the installed Stratagus commit:

- A placement click creates an unpaid `COrder_Build`; no foundation exists
  while the worker travels.
- `COrder_Build::StartBuilding` deducts resources immediately before creating
  the foundation at the site.
- Ordinary unshifted Move, Stop, Harvest, Repair, Attack, or another Build
  flushes the unpaid travel order safely.
- Inside-builders are removed into the paid foundation; cancelling that
  foundation releases the builder and returns 75%.
- Oil-platform travel follows the same unpaid/interruptible phase boundary;
  source platform definitions omit `BuilderOutside`, so arrival removes the
  tanker inside the paid foundation until completion or cancellation.

Confirmed movement and combat contracts at the installed Stratagus commit:

- A* treats currently moving occupants as cost-5 crossings and stationary
  occupants as blockers; live movement still forbids overlap. Ordinary Move
  waits/retries and expands acceptable goal range after an unreachable search.
- Empty-ground right-click for groups under 12 preserves integer source-tile
  offsets around the selection center; it does not rescale or reserve slots.
- Attack-move drops unreachable automatic aggro and resumes its original point.
  Idle auto-response saves an attack-move back to the defender's current point;
  it has no origin-radius leash.
- Ordinary point-to-point arrows/axes snapshot their impact point; only tracer
  missiles track. Already-launched impact is not cancelled by fog.
- Demolish damages all alive non-flying units in range. Default Wargus area
  missiles damage owner/allies/enemies/neutrals while excluding only their
  source caster when `CanHitOwner` is false.
