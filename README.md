# best-stealth-game-20261121-1759-entry

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/Fawulana/best-stealth-game-20261121-1759-entry/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/Fawulana/best-stealth-game-20261121-1759-entry/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

## Shadow Vault

Shadow Vault is a top-down stealth heist game. Slip into each of three vaults, steal the relic, and get out without being caught. Guards patrol with vision cones that track you down; stay in shadow tiles and behind bushes and cover to stay hidden. Toss pebbles to distract a guard and slip past, or sneak slowly to move silently. You have 3 lives — get spotted too often and the run ends. Each vault is a
hand-designed floor with its own guard layout, so the route that worked in
vault one will not save you in vault three. Sound is fully synthesized WebAudio; the game runs entirely offline with no network calls.

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
- **P** — pause
- **M** — mute
