# ansi-style

Terminal styling library inspired by [`ansi-colors`](https://github.com/doowb/ansi-colors). Supports 16-color, 256-color, and 24-bit True Color terminals, with automatic terminal color profile and experimental theme detection.

## Features

- TypeScript with zero runtime dependencies.
- Honors `NO_COLOR`, `FORCE_COLOR`, `TMUX`, and `isTTY`.
- Text style helpers: `bold`, `dim`, `italic`, and `underline`.
- Automatic color profile detection: `truecolor`, `ansi256`, `ansi16`, or `none`.
- Experimental theme helpers: `selectTheme` and `detectTheme`.
- [Open Color](https://github.com/yeun/open-color) palette: `gray`, `red`, `pink`, `magenta`, `violet`, `indigo`, `blue`, `cyan`, `teal`, `green`, `lime`, `yellow`, and `orange`.

## Usage

You can just copy [style.ts](./src/style.ts) into your project.

The optional theme detection is in [theme.ts](./src/theme.ts).

```ts
import { style } from './style.ts'
import { detectTheme, selectTheme } from './theme.ts'

const mode = await detectTheme({ fallback: 'light' }) // default fallback is 'dark'
const accent = await selectTheme({ dark: style.cyan[4], light: style.cyan[7] })

const title = mode === 'dark' ? 'Good evening' : 'Good morning'
const subtitle = `It is ${new Date().toLocaleTimeString()}`

console.log(style.bold(accent(message)))
console.log(style.magenta(subtitle))
```

## Theme Detection

Inspired by [`terminal-colorsaurus`](https://github.com/tautropfli/terminal-colorsaurus).

The `detectTheme` function queries terminal foreground/background colors using `OSC 10` and `OSC 11`. If the terminal doesn't respond, it falls back to environment variable hints and a default fallback mode.

Detection currently only works in Windows Terminal and Visual Studio Code. It does not work in Alacritty or WezTerm.

## TODO

- [ ] Tests
- [ ] Rolldown
- [ ] Publish
