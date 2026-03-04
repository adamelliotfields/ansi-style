export type ThemeMode = 'dark' | 'light'

export interface ThemePair<T> {
  dark: T
  light: T
}

interface ThemeOptions {
  env?: Record<string, string | undefined>
  fallback?: ThemeMode
  platform?: NodeJS.Platform
  runCommand?: (command: string, args: string[]) => string | null
}

export interface DetectThemeOptions extends ThemeOptions {
  stdin?: NodeJS.ReadStream
  stdout?: NodeJS.WriteStream
  timeoutMs?: number
}

export interface SelectThemeOptions extends ThemeOptions {
  mode?: ThemeMode
}

/** Query terminal-reported theme/background and fall back to env hints. */
export async function detectTheme(options: DetectThemeOptions = {}): Promise<ThemeMode> {
  const terminalMode = await queryThemeFromTerminal(options)
  if (terminalMode) return terminalMode
  return detectThemeFromEnv(options)
}

/** Select a theme based on the provided options. */
export async function selectTheme<T>(
  themes: ThemePair<T>,
  options: SelectThemeOptions = {}
): Promise<T> {
  const mode = options.mode ?? (await detectTheme(options))
  return mode === 'dark' ? themes.dark : themes.light
}

// ANSI
const BEL = '\x07'
const DCS = '\x1bP'
const OSC = '\x1b]'
const ST = '\x1b\\'
const SEP = ';'

const TERMINAL_RESPONSE_REGEX = /\x1b\](10|11);([^\x07\x1b]*)(?:\x07|\x1b\\)/g
const DEFAULT_THEME_QUERY_TIMEOUT_MS = 250

/** Approximate luma for an ANSI 256 color-cube index. */
function colorCubeLuma(code: number): number {
  const n = code - 16
  const r = Math.floor(n / 36)
  const g = Math.floor((n % 36) / 6)
  const b = n % 6
  // https://en.wikipedia.org/wiki/Rec._709#Luma_coefficients
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Classify an ANSI background index as dark/light when possible. */
function colorBgLooksDark(code: number): boolean | null {
  if (!Number.isInteger(code) || code < 0) return null
  if (code <= 6 || code === 8) return true
  if (code === 7 || (code >= 9 && code <= 15)) return false
  if (code >= 16 && code <= 231) return colorCubeLuma(code) < 2.5
  if (code >= 232 && code <= 255) return code < 244
  return null
}

/** Parse COLORFGBG and infer theme mode from its background color entry. */
function parseColorFgBg(value: string | undefined): ThemeMode | null {
  if (!value) return null
  const numericParts = value
    .split(/[;:]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))

  const bg = numericParts.at(-1)
  if (typeof bg !== 'number') return null

  const isDark = colorBgLooksDark(bg)
  if (isDark == null) return null
  return isDark ? 'dark' : 'light'
}

/** Normalize 1-4 digit hex channel values into an 8-bit channel. */
function parseScaledHexByte(value: string): number | null {
  if (!/^[\da-f]+$/i.test(value)) return null

  const parsed = Number.parseInt(value, 16)
  if (!Number.isFinite(parsed)) return null

  const max = 16 ** value.length - 1
  if (max <= 0) return 0
  return Math.round((parsed / max) * 255)
}

/** Parse OSC color payload formats (rgb, rgba, #RGB/#RRGGBB/#RRRRGGGGBBBB). */
function parseOscColor(value: string): [number, number, number] | null {
  const token = value.trim().toLowerCase()
  if (!token || token === '?') return null

  const rgbMatch = token.match(/^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/)
  if (rgbMatch) {
    const r = parseScaledHexByte(rgbMatch[1])
    const g = parseScaledHexByte(rgbMatch[2])
    const b = parseScaledHexByte(rgbMatch[3])
    if (r == null || g == null || b == null) return null
    return [r, g, b]
  }

  const rgbaMatch = token.match(
    /^rgba:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/
  )
  if (rgbaMatch) {
    const r = parseScaledHexByte(rgbaMatch[1])
    const g = parseScaledHexByte(rgbaMatch[2])
    const b = parseScaledHexByte(rgbaMatch[3])
    if (r == null || g == null || b == null) return null
    return [r, g, b]
  }

  if (token.startsWith('#')) {
    const hex = token.slice(1)
    if (hex.length === 3 || hex.length === 6 || hex.length === 12) {
      const width = hex.length / 3
      const r = parseScaledHexByte(hex.slice(0, width))
      const g = parseScaledHexByte(hex.slice(width, width * 2))
      const b = parseScaledHexByte(hex.slice(width * 2))
      if (r == null || g == null || b == null) return null
      return [r, g, b]
    }
  }

  return null
}

/** Convert an sRGB channel byte into linear-light space. */
function channelToLinear(byte: number): number {
  const normalized = byte / 255
  // IEC 61966-2-1 sRGB transfer function
  if (normalized <= 0.04045) return normalized / 12.92
  return ((normalized + 0.055) / 1.055) ** 2.4
}

/** Compute relative luminance in linear-light RGB space. */
function rgbLuminance([r, g, b]: [number, number, number]): number {
  const luma =
    channelToLinear(r) * 0.2126 + channelToLinear(g) * 0.7152 + channelToLinear(b) * 0.0722
  return luma
}

/** Convert relative luminance to CIE L* perceived lightness in range [0, 1]. */
function luminanceToPerceivedLightness(luminance: number): number {
  const lStar =
    luminance <= 216 / 24389 ? luminance * (24389 / 27) : Math.cbrt(luminance) * 116 - 16
  return lStar / 100
}

/** Perceived lightness for an RGB color in range [0, 1]. */
function rgbPerceivedLightness(rgb: [number, number, number]): number {
  return luminanceToPerceivedLightness(rgbLuminance(rgb))
}

/** Derive dark/light mode from both foreground and background, matching colorsaurus. */
function themeModeFromPalette(
  foreground: [number, number, number],
  background: [number, number, number]
): ThemeMode {
  const fg = rgbPerceivedLightness(foreground)
  const bg = rgbPerceivedLightness(background)
  if (bg < fg) return 'dark'
  if (bg > fg || bg > 0.5) return 'light'
  return 'dark'
}

/** Parse OSC10/11 replies and derive the theme when both colors are available. */
function parseTerminalResponses(input: string): ThemeMode | null {
  TERMINAL_RESPONSE_REGEX.lastIndex = 0
  let match: RegExpExecArray | null = TERMINAL_RESPONSE_REGEX.exec(input)
  let foreground: [number, number, number] | null = null
  let background: [number, number, number] | null = null

  while (match) {
    const code = match[1]
    if (code === '10' || code === '11') {
      const parsed = parseOscColor(match[2] ?? '')
      if (parsed) {
        if (code === '10') foreground = parsed
        if (code === '11') background = parsed
        if (foreground && background) {
          return themeModeFromPalette(foreground, background)
        }
      }
    }

    match = TERMINAL_RESPONSE_REGEX.exec(input)
  }

  return null
}

/** TERM-based unsupported-terminal short-circuit behavior from colorsaurus */
function isKnownUnsupportedTerminal(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform
): boolean {
  const term = env.TERM
  if (!term) return platform !== 'win32'
  if (term === 'dumb') return true
  if (term === 'Eterm') return true
  if (term === 'screen' || term.startsWith('screen.')) return true
  return false
}

/** Ensure timeout is a finite number of at least 10ms otherwise return the default. */
function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_THEME_QUERY_TIMEOUT_MS
  return Math.max(10, Math.floor(value))
}

/** Wraps OSC sequences for tmux when needed. */
export function wrapTmux(
  sequence: string,
  env: Record<string, string | undefined> = process.env
): string {
  if (!env.TMUX) return sequence
  return `${DCS}tmux;${sequence.replace(/\x1b/g, '\x1b\x1b')}${ST}`
}

/** Builds an OSC sequence and applies tmux wrapping when needed. */
export function osc(
  code: string | number,
  value = '',
  env: Record<string, string | undefined> = process.env
): string {
  const prefix = `${OSC}${code}${SEP}${value}`
  if (env.TMUX) return wrapTmux(`${prefix}${ST}`, env)
  return `${prefix}${BEL}`
}

/** Query terminal theme using OSC10/11 color probing. */
async function queryThemeFromTerminal(options: DetectThemeOptions): Promise<ThemeMode | null> {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const env = options.env ?? (process.env as Record<string, string | undefined>)
  const platform = options.platform ?? process.platform
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs)

  if (!stdin?.isTTY || !stdout?.isTTY) return null
  if (typeof stdin.on !== 'function' || typeof stdin.removeListener !== 'function') return null
  if (typeof stdout.write !== 'function') return null
  if (isKnownUnsupportedTerminal(env, platform)) return null

  return new Promise<ThemeMode | null>((resolve) => {
    let settled = false
    let buffer = ''
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const canSetRaw = typeof stdin.setRawMode === 'function'
    const wasRaw = stdin.isRaw === true
    const setRaw = stdin.setRawMode?.bind(stdin)
    const wasPaused = typeof stdin.isPaused === 'function' ? stdin.isPaused() : false

    // Track whether we attached the only data listener so cleanup can restore paused state.
    const hadDataListeners = stdin.listenerCount('data') > 0

    const parseBuffer = (): ThemeMode | null => parseTerminalResponses(buffer)

    const cleanup = () => {
      stdin.removeListener('data', onData)
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (canSetRaw && !wasRaw && setRaw) {
        try {
          setRaw(false)
        } catch {}
      }
      if ((wasPaused || !hadDataListeners) && typeof stdin.pause === 'function') stdin.pause()
    }

    const finish = (mode: ThemeMode | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(mode)
    }

    const onData = (chunk: string | Buffer) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const mode = parseBuffer()
      if (mode) finish(mode)
    }

    try {
      stdin.on('data', onData)
      if (canSetRaw && !wasRaw && setRaw) setRaw(true)
      if (wasPaused && typeof stdin.resume === 'function') stdin.resume()
      stdout.write(osc('10', '?', env))
      stdout.write(osc('11', '?', env))
    } catch {
      finish(null)
      return
    }

    timeoutId = setTimeout(() => {
      finish(parseBuffer())
    }, timeoutMs)
  })
}

/** Detect theme based on environment variables and terminal-reported background color. */
function detectThemeFromEnv(options: DetectThemeOptions = {}): ThemeMode {
  const { env = process.env as Record<string, string | undefined>, fallback = 'dark' } = options
  const parsedColorFgBg = parseColorFgBg(env.COLORFGBG)
  if (parsedColorFgBg) return parsedColorFgBg
  return fallback
}
