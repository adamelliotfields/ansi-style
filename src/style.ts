export type ColorProfile = 'truecolor' | 'ansi256' | 'ansi16' | 'none'

export type PaletteShade = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type Palette = Record<PaletteShade, string>

export type StyleFn = (text: string) => string
export type PaletteStyleFn = StyleFn & { [K in PaletteShade]: StyleFn }

// https://github.com/yeun/open-color
export const style = {
  bold: (text: string) => sgr(text, ANSI.BOLD),
  dim: (text: string) => sgr(text, ANSI.DIM),
  italic: (text: string) => sgr(text, ANSI.ITALIC),
  underline: (text: string) => sgr(text, ANSI.UNDERLINE),
  white: (text: string) => sgr(text, color('#ffffff')),
  black: (text: string) => sgr(text, color('#000000')),
  gray: fromHex('f8f9faf1f3f5e9ecefdee2e6ced4daadb5bd868e96495057343a40212529'),
  red: fromHex('fff5f5ffe3e3ffc9c9ffa8a8ff8787ff6b6bfa5252f03e3ee03131c92a2a'),
  pink: fromHex('fff0f6ffdeebfcc2d7faa2c1f783acf06595e64980d6336cc2255ca61e4d'),
  magenta: fromHex('f8f0fcf3d9faeebefae599f7da77f2cc5de8be4bdbae3ec99c36b5862e9c'), // grape
  violet: fromHex('f3f0ffe5dbffd0bfffb197fc9775fa845ef77950f27048e86741d95f3dc4'),
  indigo: fromHex('edf2ffdbe4ffbac8ff91a7ff748ffc5c7cfa4c6ef54263eb3b5bdb364fc7'),
  blue: fromHex('e7f5ffd0ebffa5d8ff74c0fc4dabf7339af0228be61c7ed61971c21864ab'),
  cyan: fromHex('e3fafcc5f6fa99e9f266d9e83bc9db22b8cf15aabf1098ad0c85990b7285'),
  teal: fromHex('e6fcf5c3fae896f2d763e6be38d9a920c99712b8860ca678099268087f5b'),
  green: fromHex('ebfbeed3f9d8b2f2bb8ce99a69db7c51cf6640c05737b24d2f9e442b8a3e'),
  lime: fromHex('f4fce3e9fac8d8f5a2c0eb75a9e34b94d82d82c91e74b81666a80f5c940d'),
  yellow: fromHex('fff9dbfff3bfffec99ffe066ffd43bfcc419fab005f59f00f08c00e67700'),
  orange: fromHex('fff4e6ffe8ccffd8a8ffc078ffa94dff922bfd7e14f76707e8590cd9480f')
} as const

const CSI = '\x1b['
const RESET = '\x1b[0m'

const ANSI = {
  RESET: '0',
  BOLD: '1',
  DIM: '2',
  ITALIC: '3',
  UNDERLINE: '4'
} as const

const ANSI_16_PALETTE = [
  [0, 0, 0],
  [205, 49, 49],
  [13, 188, 121],
  [229, 229, 16],
  [36, 114, 200],
  [188, 63, 188],
  [17, 168, 205],
  [229, 229, 229],
  [102, 102, 102],
  [241, 76, 76],
  [35, 209, 139],
  [245, 245, 67],
  [59, 142, 234],
  [214, 112, 214],
  [41, 184, 219],
  [255, 255, 255]
] as const

// Cache detected color profile
let _profile: ColorProfile | undefined

/** Create a palette style function from a 60-char hex string (10 concatenated 6-char colors). */
function fromHex(hexes: string, defaultShade: PaletteShade = 5): PaletteStyleFn {
  const hex = (i: number) => `#${hexes.slice(i * 6, i * 6 + 6)}`
  const apply = ((text: string) => sgr(text, color(hex(defaultShade)))) as PaletteStyleFn
  for (let i = 0; i < 10; i++) {
    const s = i as PaletteShade
    apply[s] = (text: string) => sgr(text, color(hex(s)))
  }
  return apply
}

/** Get the ANSI SGR code for a 16-color palette index. */
function ansi16Code(index: number): string {
  const base = index < 8 ? 30 : 90
  return String(base + (index % 8))
}

/** Convert RGB values to the nearest ANSI 16-color code index. */
function rgbToAnsi16(red: number, green: number, blue: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < 16; i++) {
    const [r, g, b] = ANSI_16_PALETTE[i]
    const dist = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best
}

/** Convert RGB values to the nearest ANSI 256-color code. */
function rgbToAnsi256(red: number, green: number, blue: number): number {
  if (red === green && green === blue) {
    if (red < 8) return 16
    if (red > 248) return 231
    return 232 + Math.round(((red - 8) / 247) * 24)
  }
  return (
    16 +
    36 * Math.round((red / 255) * 5) +
    6 * Math.round((green / 255) * 5) +
    Math.round((blue / 255) * 5)
  )
}

/** Map a color depth in bits to a ColorProfile. */
function mapColorDepth(depth: number): ColorProfile {
  if (depth >= 24) return 'truecolor'
  if (depth >= 8) return 'ansi256'
  if (depth >= 4) return 'ansi16'
  return 'none'
}

/** Detect color profile based on environment variables and terminal capabilities. */
function detectProfile(
  stream: NodeJS.WriteStream = process.stdout,
  env: NodeJS.ProcessEnv = process.env
): ColorProfile {
  if (env.FORCE_COLOR === '0' || env.FORCE_COLOR?.toLowerCase() === 'false') return 'none'
  if (typeof env.NO_COLOR !== 'undefined') return 'none'
  if (!stream.isTTY) return 'none'
  if (typeof stream.getColorDepth === 'function') return mapColorDepth(stream.getColorDepth(env))
  return 'none'
}

/** Get the detected color profile and cache the result. */
function getProfile(): ColorProfile {
  if (_profile === undefined) {
    _profile = detectProfile()
  }
  return _profile
}

/** Parse a hex color string (#RGB, RGB, #RRGGBB, or RRGGBB) into RGB components. */
function parseHexColor(value: string): [number, number, number] | undefined {
  const raw = value.startsWith('#') ? value.slice(1) : value
  if (!/^[0-9a-f]{3}$/i.test(raw) && !/^[0-9a-f]{6}$/i.test(raw)) return undefined
  const expanded =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : raw
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16)
  ]
}

/** Validate that a number is an integer between 0 and 255 (inclusive). */
function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

/** Returns the SGR opener string for a foreground color (no reset). */
function color(hex: string): string
function color(red: number, green: number, blue: number): string
function color(redOrHex: number | string, green?: number, blue?: number): string {
  let redValue: number
  let greenValue: number
  let blueValue: number
  if (typeof redOrHex === 'string') {
    const rgb = parseHexColor(redOrHex)
    if (!rgb) {
      throw new TypeError('color() hex color must be #RGB, RGB, #RRGGBB, or RRGGBB')
    }
    redValue = rgb[0]
    greenValue = rgb[1]
    blueValue = rgb[2]
  } else {
    if (green === undefined || blue === undefined) {
      throw new TypeError('color() requires either a hex string or 3 RGB integers')
    }
    if (!isByte(redOrHex) || !isByte(green) || !isByte(blue)) {
      throw new RangeError('color() RGB values must be integers between 0 and 255')
    }
    redValue = redOrHex
    greenValue = green
    blueValue = blue
  }

  // Return the highest-fidelity SGR code for the given color based on the detected profile
  const p = getProfile()
  if (p === 'none') return ''
  if (p === 'truecolor') return `38;2;${redValue};${greenValue};${blueValue}`
  if (p === 'ansi256') return `38;5;${rgbToAnsi256(redValue, greenValue, blueValue)}`
  return ansi16Code(rgbToAnsi16(redValue, greenValue, blueValue))
}

/** Wraps text in SGR codes with reset. */
function sgr(text: string, ...codes: string[]): string {
  const filtered = codes.filter(Boolean)
  if (filtered.length === 0 || getProfile() === 'none') return text
  return `${CSI}${filtered.join(';')}m${text}${RESET}`
}
