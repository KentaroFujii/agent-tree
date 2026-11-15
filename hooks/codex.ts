// Finds a Codex CLI run (`codex exec`, `codex exec review`) in a Bash command.
// Only a command whose program is `codex` with the `exec` subcommand counts:
// `codex login status`, `echo codex exec` or a grep for "codex exec" do not.

export type CodexCall = {
  kind: 'exec' | 'review'
  model?: string
  effort?: string
  output?: string
  cwd?: string
  images: number
}

type Token = { kind: 'word'; text: string } | { kind: 'sep' } | { kind: 'redir' }

const WITH_VALUE = new Set([
  '-m',
  '--model',
  '-c',
  '--config',
  '-C',
  '--cd',
  '-i',
  '--image',
  '-s',
  '--sandbox',
  '-p',
  '--profile',
  '-o',
  '--output-last-message',
  '--output-schema',
  '--color',
  '-a',
  '--ask-for-approval',
  '--base',
  '--commit',
  '--title',
  '--add-dir',
  '--local-provider',
  '--enable',
  '--disable',
])

function tokenize(command: string): Token[] {
  const tokens: Token[] = []
  let word = ''
  let inWord = false
  let quoted = false
  let wantDelimiter = false
  const heredocs: string[] = []
  const flush = () => {
    if (inWord) {
      tokens.push({ kind: 'word', text: word })
      if (wantDelimiter) heredocs.push(word)
      wantDelimiter = false
    }
    word = ''
    inWord = false
    quoted = false
  }
  let i = 0
  while (i < command.length) {
    const c = command[i] ?? ''
    if (c === '\n' && (heredocs.length > 0 || (wantDelimiter && inWord))) {
      flush()
      tokens.push({ kind: 'sep' })
      i += 1
      while (heredocs.length > 0) {
        const delimiter = heredocs.shift() ?? ''
        for (;;) {
          if (i >= command.length) break
          const end = command.indexOf('\n', i)
          const line = command.slice(i, end < 0 ? command.length : end)
          i = end < 0 ? command.length : end + 1
          if (line.replace(/^\t+/, '').trimEnd() === delimiter) break
        }
      }
      continue
    }
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      const stop = end < 0 ? command.length : end
      word += command.slice(i + 1, stop)
      inWord = true
      quoted = true
      i = stop + 1
      continue
    }
    if (c === '"') {
      i += 1
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < command.length && '"\\$`'.includes(command[i + 1] ?? '')) i += 1
        word += command[i] ?? ''
        i += 1
      }
      inWord = true
      quoted = true
      i += 1
      continue
    }
    if (c === '\\') {
      if (command[i + 1] === '\n') {
        i += 2
        continue
      }
      word += command[i + 1] ?? ''
      inWord = true
      i += 2
      continue
    }
    if (c === '#' && !inWord) {
      const end = command.indexOf('\n', i)
      i = end < 0 ? command.length : end
      continue
    }
    if (c === ' ' || c === '\t') {
      flush()
      i += 1
      continue
    }
    if (c === '\n' || c === ';' || c === '(' || c === ')') {
      flush()
      tokens.push({ kind: 'sep' })
      i += 1
      continue
    }
    if (c === '&' && command[i + 1] === '>') {
      flush()
      tokens.push({ kind: 'redir' })
      i += command[i + 2] === '>' ? 3 : 2
      continue
    }
    if (c === '&' || c === '|') {
      flush()
      tokens.push({ kind: 'sep' })
      i += command[i + 1] === c ? 2 : 1
      continue
    }
    if (c === '<' || c === '>') {
      if (inWord && !quoted && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      } else flush()
      let op = c
      i += 1
      while (i < command.length && '<>&|'.includes(command[i] ?? '')) {
        op += command[i]
        i += 1
      }
      if (op.endsWith('&')) {
        while (i < command.length && /[\d-]/.test(command[i] ?? '')) i += 1
        continue
      }
      if (op === '<<' && command[i] === '-') i += 1
      if (op === '<<') wantDelimiter = true
      tokens.push({ kind: 'redir' })
      continue
    }
    word += c
    inWord = true
    i += 1
  }
  flush()
  return tokens
}

function segments(tokens: Token[]): string[][] {
  const out: string[][] = [[]]
  let skipNext = false
  for (const token of tokens) {
    if (token.kind === 'sep') {
      if ((out.at(-1) ?? []).length) out.push([])
      skipNext = false
      continue
    }
    if (token.kind === 'redir') {
      skipNext = true
      continue
    }
    if (skipNext) {
      skipNext = false
      continue
    }
    out.at(-1)?.push(token.text)
  }
  return out.filter(segment => segment.length > 0)
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

function program(words: string[]): string[] {
  let at = 0
  for (;;) {
    while (at < words.length && ASSIGNMENT.test(words[at] ?? '')) at += 1
    const head = words[at]
    if (head === 'env') {
      at += 1
      while (at < words.length) {
        const w = words[at] ?? ''
        if (w === '-u' || w === '--unset' || w === '-C' || w === '--chdir' || w === '-S' || w === '--split-string') at += 2
        else if (w.startsWith('-') || ASSIGNMENT.test(w)) at += 1
        else break
      }
      continue
    }
    if (head === 'command' || head === 'nohup' || head === 'exec' || head === 'time') {
      at += 1
      while (at < words.length && (words[at] ?? '').startsWith('-')) at += 1
      continue
    }
    if (head === 'timeout' || head === 'gtimeout') {
      at += 1
      while (at < words.length && (words[at] ?? '').startsWith('-')) {
        const w = words[at] ?? ''
        at += (w === '-k' || w === '-s' || w === '--kill-after' || w === '--signal') ? 2 : 1
      }
      at += 1
      continue
    }
    return words.slice(at)
  }
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? ''
}

function setting(call: CodexCall, pair: string): void {
  const eq = pair.indexOf('=')
  if (eq < 1) return
  const key = pair.slice(0, eq).trim()
  const value = pair.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  if (!value) return
  if (key === 'model') call.model = value
  else if (key === 'model_reasoning_effort') call.effort = value
}

function codexIn(words: string[], cwd: string | undefined): CodexCall | undefined {
  const [name, ...args] = program(words)
  if (name === undefined || baseName(name) !== 'codex') return undefined
  const call: CodexCall = { kind: 'exec', images: 0, ...(cwd ? { cwd } : {}) }
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '--') {
      positional.push(...args.slice(i + 1))
      break
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const flag = eq > 0 ? arg.slice(0, eq) : arg
    const takes = WITH_VALUE.has(flag)
    const value = !takes ? undefined : eq > 0 ? arg.slice(eq + 1) : args[++i]
    if (takes) {
      if (value === undefined) continue
      if (flag === '-m' || flag === '--model') call.model = value
      else if (flag === '-c' || flag === '--config') setting(call, value)
      else if (flag === '-o' || flag === '--output-last-message') call.output = value
      else if (flag === '-i' || flag === '--image') call.images += value.split(',').filter(Boolean).length
      continue
    }
    if (arg.startsWith('-') && arg !== '-') continue
    positional.push(arg)
  }
  const sub = positional[0]
  if (sub !== 'exec' && sub !== 'e') return undefined
  if (positional[1] === 'review') call.kind = 'review'
  return call
}

const VARIABLE = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g

// Puts in what `NAME=value` set earlier in the same command (`S=/tmp/cx; ... -o $S/out.md`).
// A name it does not know stays as written, so a later step can tell the path is open.
export function expandVariables(text: string, known: Readonly<Record<string, string>>): string {
  return text.replace(VARIABLE, (whole: string, braced: string | undefined, bare: string | undefined) => known[braced ?? bare ?? ''] ?? whole)
}

function assignments(words: string[]): [string, string][] | undefined {
  const list = words[0] === 'export' || words[0] === 'local' || words[0] === 'declare' ? words.slice(1) : words
  if (!list.length || !list.every(w => ASSIGNMENT.test(w))) return undefined
  return list.map(w => {
    const eq = w.indexOf('=')
    return [w.slice(0, eq), w.slice(eq + 1)]
  })
}

export function parseCodexCommand(command: unknown): CodexCall | undefined {
  if (typeof command !== 'string' || !/\bcodex\b/.test(command)) return undefined
  let cwd: string | undefined
  const known: Record<string, string> = {}
  for (const raw of segments(tokenize(command))) {
    const set = assignments(raw)
    if (set) {
      // `d=$(mktemp -d)` reaches here as `d=$`: a value still holding `$` is not known
      for (const [name, value] of set) {
        const expanded = expandVariables(value, known)
        if (expanded && !expanded.includes('$')) known[name] = expanded
        else delete known[name]
      }
      continue
    }
    const words = raw.map(w => expandVariables(w, known))
    const [head, target] = program(words)
    if ((head === 'cd' || head === 'pushd') && target !== undefined) {
      cwd = target.includes('$')
        ? undefined
        : target.startsWith('/')
          ? target
          : cwd && !target.startsWith('~')
            ? `${cwd.replace(/\/$/, '')}/${target}`
            : undefined
      if (cwd) known.PWD = cwd
      else delete known.PWD
      continue
    }
    const found = codexIn(words, cwd)
    if (found) return found
  }
  return undefined
}

// How a foreground Bash run of Codex ended, read from what `tool.call` resolved to.
// Core marks every Bash error `isError`; only `Exit code N` means the command ran.
// Anything else (a PreToolUse hook, a permission denial, the engine's own refusal)
// stopped it before Codex started.
export type CodexOutcome = { status: 'done' | 'failed' | 'stopped' | 'blocked' | 'background'; text?: string }

const RAN_AND_FAILED = /^Exit code \d+/
const CODEX_USAGE = /(?:^|\n)error: (?:unexpected argument|unrecognized subcommand|invalid value|the argument)|(?:^|\n)Usage: codex /

export function codexOutcome(result: unknown, answerFileWritten: boolean): CodexOutcome {
  const r = (result ?? {}) as { deny?: unknown; isError?: unknown; result?: unknown; text?: unknown }
  if (typeof r.deny === 'string') return { status: 'blocked', text: r.deny }
  const record = (r.result && typeof r.result === 'object' ? r.result : {}) as { interrupted?: unknown; backgroundTaskId?: unknown; stdout?: unknown }
  const text = typeof r.text === 'string' && r.text.trim() ? r.text : typeof r.result === 'string' ? r.result : undefined
  if (r.isError === true) {
    const said = (text ?? '').replace(/^Error: /, '')
    return { status: RAN_AND_FAILED.test(said) ? 'failed' : 'blocked', ...(said ? { text: said } : {}) }
  }
  if (typeof record.backgroundTaskId === 'string' && record.backgroundTaskId) return { status: 'background' }
  if (record.interrupted === true) return { status: 'stopped' }
  const stdout = typeof record.stdout === 'string' && record.stdout.trim() ? record.stdout : text
  // A wrapper like `codex ...; echo exit=$?` hides the exit code from Bash: Codex's
  // own usage error in the output, with no answer file written, still means it failed
  if (!answerFileWritten && stdout && CODEX_USAGE.test(stdout)) return { status: 'failed', text: stdout }
  return { status: 'done', ...(stdout ? { text: stdout } : {}) }
}

export function codexDefaults(toml: unknown): { model?: string; effort?: string } {
  if (typeof toml !== 'string') return {}
  const found: { model?: string; effort?: string } = {}
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('[')) break
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/.exec(line)
    if (!match) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (!value) continue
    if (match[1] === 'model') found.model = value
    else if (match[1] === 'model_reasoning_effort') found.effort = value
  }
  return found
}

export function resolvedPath(path: string, cwd: string | undefined, home: string | undefined): string {
  if (path.startsWith('/')) return path
  if (path.startsWith('~/') && home) return `${home.replace(/\/$/, '')}/${path.slice(2)}`
  if (cwd && cwd.startsWith('/')) return `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`
  return path
}
