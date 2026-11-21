# best-stealth-game-20261121-1759-entry

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/Fawulana/best-stealth-game-20261121-1759-entry/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/Fawulana/best-stealth-game-20261121-1759-entry/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

## Shadow Vault

Shadow Vault is a top-down stealth heist game. Slip into each of four vaults — The Gallery, The Vault Hall, The Grand Vault, and The Laser Vault — steal the relic, and get out without being caught. Guards patrol with vision cones that track you down; stay in shadow tiles and behind bushes and cover to stay hidden. Toss pebbles to distract a guard and slip past, or sneak slowly to move silently. You have 3 lives — get spotted too often and the run ends. Each vault is a hand-designed floor with its own guard layout, so the route that worked in vault one will not save you in vault four.

The later vaults add new threats. Wall-mounted security cameras sweep long, narrow vision cones across the halls; when a camera's detection meter fills, it raises the alarm and sends the nearest guard to investigate. A guard dog patrols The Grand Vault and The Laser Vault — it hears footsteps from far away, so only sneaking stays silent to it. The Grand Vault is also watched by sweeping searchlight sentries. In The Laser Vault, a pulsing laser grid guards the Heart of Glass: crossing a live beam fills your detection fast and raises the alarm, so find the keycard first to cut the beams.

Every sighting feeds a global alarm level — CALM, ALERT, or LOCKDOWN — shown on the HUD alarm meter. Each level makes every patrol faster and quicker to spot you, until a quiet stretch lets it cool back down. The HUD also tracks your objective (keycard, relic, exit), score, coins, pebbles, smoke bombs, lives, and time. Smoke bombs are your escape tool: drop one to block every vision cone for 4.5 seconds, but nearby guards will come to look at the cloud once it clears. Sound is fully synthesized WebAudio; the game runs entirely offline with no network calls.

## Run it

No build step, no dependencies — just serve the `game/` directory with any static server:

```bash
npx serve game
```

or

```bash
cd game && python3 -m http.server
```

Then open `game/index.html` in desktop Chrome.

## Controls

- **WASD / arrow keys** — move
- **Shift** — sneak (slower, quieter)
- **Mouse click** — throw a pebble to distract guards
- **X / right-click** — drop a smoke bomb (2 per level; X drops it at your feet, right-click at the cursor)
- **P** — pause
- **M** — mute
