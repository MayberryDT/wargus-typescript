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
  occupants as blockers on the same movement layer; land, naval, and flying
  occupancy are filtered separately. Live movement still forbids same-layer
  overlap. Ordinary Move waits/retries and expands acceptable goal range after
  an unreachable search.
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

Confirmed source-AI contracts:

- Each AI runs once per simulated second. Its script advances until a sleep or
  unmet wait blocks; the installed launcher leaves the initial land-AI sleep at
  zero cycles.
- `AiNeed` adds one desired request. `AiSet` changes the absolute desired count.
- `AiAttackWithForce` immediately launches members into a detached internal
  force, resets the scripted slot, and continues to the next barrier in the
  same think. Launched members do not replenish or satisfy the next force.
- Workers already building, repairing, or actively gathering are ineligible;
  unpaid build-travel costs are reserved so the AI does not overcommit.
- Source speed values are percentages: 75/100/100/120/150 correspond to runtime
  factors 0.75/1/1/1.2/1.5.
- Exploration reads the AI player's own explored map and is attempted at most
  every five simulated seconds.

Confirmed fixed-demo/source boundary:

- One Peasant and 10,000 gold / 5,000 wood / 5,000 oil are original Wargus
  setup options. Distance-filtered starts and pacing score bands are
  TypeScript-demo tuning, not original rules.
- Garden of War BNE source starts 1 and 6 use `wc2-air-attack`; the others use
  `wc2-land-attack`. Distance-only pairing therefore mixes incomparable contact
  strategies unless the fixed demo filters or stratifies AI type.

Confirmed command, production, and selection contracts at the installed
Wargus/Stratagus commits:

- Source usually omits unavailable command buttons; always-visible grayscale
  commands and English disabled reasons are TypeScript usability enhancements.
  Dependency alternatives use the first declared invalid alternative and
  report all of its missing requirements. Resource feedback reports every
  missing resource.
- Production queues accept up to 127 orders while the source HUD exposes six
  slots. Paying a queued order subtracts resources but does not reserve food;
  the head rechecks supply and limits at completion and waits if blocked.
  Indexed cancellation refunds that order's resources only.
- `DropOutOnSide` expands outward until it finds a legal egress tile. A bounded
  whole-map `no-egress` result is a TypeScript safety divergence; immediate-ring
  obstruction is not a terminal spawn block.
- Source selection caps at 18. Building/mobile classification uses the actual
  unit-definition Building flag, so large mobile siege/ships stay mobile.
  Additive selection admits eligible local/teamed mobiles together but never
  mixes a building with mobiles; building-first admits only the same type.
  Plain rectangle selection prefers eligible owned/team mobiles, then same-type
  buildings, then one static, neutral, or enemy object.
- Source command status text omits duration. `Time Ns`, explicit `Build Hall`,
  `Provides N Food`, and the exact imported `ZTOP` display correction are
  deliberate TypeScript clarity enhancements, not original UI behavior.
