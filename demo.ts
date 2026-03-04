import type { StyleFn } from './src/index.ts'
import { detectTheme, style } from './src/index.ts'

const sample = 'Sphinx of black quartz, judge my vow 0123456789'
const BLOCK = '\u2588\u2588'
const PAD = 15

const colors = [
  ['gray', style.gray],
  ['red', style.red],
  ['pink', style.pink],
  ['magenta', style.magenta],
  ['violet', style.violet],
  ['indigo', style.indigo],
  ['blue', style.blue],
  ['cyan', style.cyan],
  ['teal', style.teal],
  ['green', style.green],
  ['lime', style.lime],
  ['yellow', style.yellow],
  ['orange', style.orange]
] as const

const typographyTests: Array<[name: string, apply: StyleFn]> = [
  ['bold', style.bold],
  ['dim', style.dim],
  ['italic', style.italic],
  ['underline', style.underline]
]

const colorTests: Array<[name: string, apply: StyleFn]> = colors.map(([name, fn]) => [name, fn])

const combinedTests: Array<[name: string, apply: StyleFn]> = [
  ['dim lime', (text) => style.dim(style.lime(text))],
  ['bold cyan', (text) => style.bold(style.cyan(text))],
  ['italic violet', (text) => style.italic(style.violet(text))],
  ['underline pink', (text) => style.underline(style.pink(text))]
]

function runSuite(tests: Array<[name: string, apply: StyleFn]>, text = sample): void {
  for (const [name, apply] of tests) {
    console.log(`${name.padEnd(PAD)} ${apply(text)}`)
  }
}

const mode = await detectTheme()
const modeStyle = mode === 'dark' ? style.white : style.black

// Shades 0–9 for each color in a palette
const header = Array.from({ length: 10 }, (_, i) => String(i).padStart(2)).join('')
console.log(`${''.padEnd(PAD)} ${header}`)
for (const [name, fn] of colors) {
  const row = Array.from({ length: 10 }, (_, i) => fn[i as 0](BLOCK)).join('')
  console.log(`${name.padEnd(PAD)} ${row}`)
}
console.log()
console.log(`${'theme'.padEnd(PAD)} ${modeStyle(mode)}`)
console.log()
runSuite(typographyTests)
console.log()
runSuite(colorTests)
console.log()
runSuite(combinedTests)
