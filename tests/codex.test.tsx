import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { codexDefaults, codexOutcome, expandVariables, parseCodexCommand, resolvedPath } from '../hooks/codex.ts'
import { CODEX_COLORS, PALETTES, STYLES, contrast } from '../hooks/looks.ts'
import { codexEnded, codexOf, codexStarted, codexText, codexToggled, createTree, freshTree, trimmed, spawned } from '../hooks/model.ts'
import { codexBeside, codexInline, codexOpenLines, planRows, usedRows } from '../hooks/view.tsx'
import type { RowPlanInput } from '../hooks/view.tsx'
import type { AgentTreeState } from '../types'

declare const console: { log: (...parts: unknown[]) => void }

const EXEC =
  'env -u CODEX_API_KEY -u OPENAI_API_KEY codex exec --sandbox read-only -m gpt-5.5 -c model_reasoning_effort="high" --ephemeral -C /Users/k/repo -o /tmp/cx.Ab12/answer.md - < /tmp/cx.Ab12/question.md'
const REVIEW =
  'cd /Users/k/repo && env -u CODEX_API_KEY -u OPENAI_API_KEY codex exec review --base main -c sandbox_mode="read-only" -m gpt-5.5-codex -c model_reasoning_effort="xhigh" --ephemeral -o /tmp/cx.Cd34/review.md < /dev/null 2> /tmp/cx.Cd34/stderr.log'

const ANSWER = [
  '## Findings',
  '1. hooks/register.tsx:120 the guard never awaits the write.',
  '2. hooks/view.tsx:88 the row count ignores the footer.',
  '',
  '3. tests miss the failure path.',
  '4. README is out of date.',
  'Overall: fix 1 before merging.',
].join('\n')

type FileEntry = { text: string; mtimeMs: number }

type BashAnswer = { stdout?: string; text?: string; isError?: boolean; background?: boolean; writes?: Record<string, string>; raw?: unknown }

function engine(on: On, files: Record<string, FileEntry> = {}) {
  let lastTree: AgentTreeState = createTree(0)
  let clockTick = 1_000
  const answers: BashAnswer[] = []
  let hold: Promise<void> | undefined
  let reached: () => void = () => undefined
  const bashCalls: string[] = []
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('command.register', () => ({ value: { command: 'agent-tree' } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.invalidate', (_, e, next) => next(e))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  let spawns = 0
  on('agent.spawn', async () => ({ model: 'claude-sonnet-5-5', agentId: `sub-${++spawns}` }))
  on('turn.start', async (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_, e) => ({ text: e.answer }) as never)
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'HOME' ? '/Users/k' : undefined }) as never)
  on('fs.stat', (_, e) => {
    const file = files[(e as { path: string }).path]
    if (!file) throw new Error('ENOENT')
    return { value: { kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs, isLink: false } } as never
  })
  on('fs.read', (_, e) => {
    const file = files[(e as { path: string }).path]
    if (!file) throw new Error('ENOENT')
    return { value: file.text } as never
  })
  on('tool.call', async (_, e) => {
    const command = String((e as { command?: unknown }).command ?? '')
    bashCalls.push(command)
    reached()
    if (hold) await hold
    const answer = answers.shift() ?? {}
    for (const [path, text] of Object.entries(answer.writes ?? {})) files[path] = { text, mtimeMs: (clockTick += 1000) }
    if (answer.raw !== undefined) return answer.raw as never
    const record = { stdout: answer.stdout ?? '', stderr: '', interrupted: false, ...(answer.background ? { backgroundTaskId: 'bg-1' } : {}) }
    if (answer.isError) return { isError: true, result: answer.text ?? 'Exit code 1', text: answer.text ?? 'Exit code 1' } as never
    return { result: record, text: answer.text ?? answer.stdout ?? '' } as never
  })
  on('state.set', async (_, e, next) => {
    const own = (e as { plugin?: string; key?: string }).plugin === 'agent-tree' && (e as { key?: string }).key === 'tree'
    const held = (e as { value?: { shape?: string; value?: AgentTreeState } }).value
    if (own && held?.value) lastTree = held.shape !== undefined ? held.value : (held as unknown as AgentTreeState)
    return next(e)
  })
  return {
    tree: () => lastTree,
    answer: (a: BashAnswer) => answers.push(a),
    bashCalls,
    holdNext: () => {
      let release: () => void = () => undefined
      hold = new Promise<void>(resolve => {
        release = resolve
      })
      const arrived = new Promise<void>(resolve => {
        reached = resolve
      })
      return {
        arrived,
        release: () => {
          hold = undefined
          release()
        },
      }
    },
  }
}

const en = { options: { language: 'en', intro: false } }

const pane = (bodyColumns: number, bodyRows = 80) =>
  ({
    plugin: 'agent-tree',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-tree',
    props: { title: 'Agent Tree', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

async function withCodexAgent($: Engine) {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'Get a second opinion from Codex', turnId: 't1' })
  await $.agent.spawn({ prompt: 'Ask Codex to review.', description: 'Codex review', subagentType: 'kentaro-skills:connector-codex' } as never)
}

type Drawn = { type?: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }

function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  const n = node as Drawn
  return (n.children ?? []).map(textOf).join('')
}

function findKey(node: unknown, key: string): Drawn | undefined {
  if (!node || typeof node !== 'object') return undefined
  const n = node as Drawn
  if (n.key === key || n.props?.key === key) return n
  for (const child of n.children ?? []) {
    const hit = findKey(child, key)
    if (hit) return hit
  }
  return undefined
}

const look = { lang: 'en' as const, now: 50_000, spin: '◐', marks: STYLES.line.marks, mark: '◇', rail: '│', tight: false }

describe('Codex runs: reading the command', () => {
  test('the prompt-file form gives model, effort and the output file', () => {
    expect(parseCodexCommand(EXEC)).toEqual({ kind: 'exec', model: 'gpt-5.5', effort: 'high', output: '/tmp/cx.Ab12/answer.md', images: 0 })
  })

  test('the review form gives kind review, the folder cd went to and the output file', () => {
    expect(parseCodexCommand(REVIEW)).toEqual({
      kind: 'review',
      model: 'gpt-5.5-codex',
      effort: 'xhigh',
      output: '/tmp/cx.Cd34/review.md',
      cwd: '/Users/k/repo',
      images: 0,
    })
  })

  test('images, --model=, -c model= and a missing -m are read', () => {
    expect(parseCodexCommand('codex exec -m gpt-5.5 -i /a.png -i /b.png -o out.md - < q.md')).toMatchObject({ images: 2, output: 'out.md' })
    expect(parseCodexCommand('codex exec --model=o4 -o x.md -')?.model).toBe('o4')
    expect(parseCodexCommand('codex exec -c model="gpt-5.5" -c model_reasoning_effort=low -')).toMatchObject({ model: 'gpt-5.5', effort: 'low' })
    expect(parseCodexCommand('codex exec --ephemeral -o /t/o.md -')?.model).toBeUndefined()
    expect(parseCodexCommand('timeout 600 codex e -m gpt-5.5 -')?.kind).toBe('exec')
  })

  test('anything but codex exec is not counted', () => {
    const others = [
      'codex login status',
      'env -u OPENAI_API_KEY codex login status',
      'codex --version',
      'which codex',
      'echo codex exec',
      'echo "codex exec -m gpt-5.5"',
      'grep -rn "codex exec -m gpt-5.5" plugins/',
      "rg 'codex exec' agents/connector-codex.md",
      'ls ~/.codex && cat ~/.codex/config.toml',
      "cat > notes.md <<'EOF'\ncodex exec -m gpt-5.5 -\nEOF",
      'git log --oneline | grep codex',
    ]
    for (const command of others) expect(parseCodexCommand(command)).toBeUndefined()
  })

  test('the config default and a relative output path', () => {
    expect(codexDefaults('model = "gpt-5.5"\nmodel_reasoning_effort = "high"\n[profiles.x]\nmodel = "o3"\n')).toEqual({ model: 'gpt-5.5', effort: 'high' })
    expect(codexDefaults('forced_login_method = "chatgpt"\n\n[tui]\nscreen_reader_detection_done = true\n')).toEqual({})
    expect(resolvedPath('out.md', '/Users/k/repo', '/Users/k')).toBe('/Users/k/repo/out.md')
    expect(resolvedPath('~/x/out.md', undefined, '/Users/k')).toBe('/Users/k/x/out.md')
  })
})

describe('Codex runs: state', () => {
  test('a tree saved before Codex runs existed draws and clears as before', () => {
    const old = createTree(5)
    expect(codexOf(old)).toEqual([])
    expect(codexInline(old, undefined, 'main', look, 29)).toEqual([])
    expect(codexOpenLines(old, look)).toEqual([])
    expect(codexToggled(old, 'x').codexOpen).toBeUndefined()
    expect(freshTree(old, 6).codex).toBeUndefined()
  })

  test('the answer keeps its lines, masks a token and drops runs of blank lines', () => {
    const kept = codexText('first\n\n\n\nsecond with sk-abcdefghijklmnop\n')
    expect(kept.text).toBe('first\n\nsecond with •••')
    expect(kept.lines).toBe(3)
  })

  test('clear keeps only running runs, trimming an agent drops its runs', () => {
    let s = spawned(createTree(0), { agentId: 'a1', agentType: 'connector-codex', description: 'x', background: false, fork: false }, 1)
    s = codexStarted(s, { id: 'r1', agentId: 'a1', kind: 'exec', model: 'gpt-5.5' }, 2)
    s = codexStarted(s, { id: 'r2', kind: 'review' }, 3)
    s = codexEnded(s, 'r1', { status: 'done', answer: 'ok', from: 'file' }, 4)
    expect(freshTree(s, 5).codex?.map(r => r.id)).toEqual(['r2'])
    const ended = { ...s, agents: s.agents.map(n => ({ ...n, status: 'done' as const, endedAt: 4 })) }
    const withOther = spawned(ended, { agentId: 'a2', agentType: 'Plan', description: 'y', background: false, fork: false }, 6)
    expect(trimmed(withOther, 1).codex?.map(r => r.id)).toEqual(['r2'])
  })

  test('the Codex color reads on its background in every palette', () => {
    expect(contrast(CODEX_COLORS.light, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    for (const name of ['original', 'retro', 'mono'] as const) expect(contrast(CODEX_COLORS[name], '#1C1C26')).toBeGreaterThanOrEqual(4.5)
    expect(Object.keys(CODEX_COLORS).sort()).toEqual(Object.keys(PALETTES).sort())
  })
})

// Shapes taken from a real session's transcript (2026-11-15, connector-codex
// "Codex の動作確認"), paths made anonymous. Run 1 was refused by a PreToolUse hook
// before Codex started; run 2 ran for about 6 s and wrote "OK" to `$d/out.txt`.
const RUN1 =
  'd=$(mktemp -d); echo "OK とだけ返して" > $d/q.md; env -u CODEX_API_KEY -u OPENAI_API_KEY codex exec --sandbox read-only -m gpt-6.1-sol -c model_reasoning_effort="medium" --ephemeral -C /Users/k/workspace -o $d/out.txt - < $d/q.md > $d/stdout.log 2> $d/stderr.log; echo exit=$?; echo ---out; cat $d/out.txt; echo ---stderr; head -20 $d/stderr.log; echo $d'
const RUN1_HOOK = 'PreToolUse:Bash hook error: Bashでのファイル直接編集はブロックされています（差分が表示されないため）。Edit/Writeツールを使ってください。'
const RUN1_RESULT = { ref: 1, result: `Error: ${RUN1_HOOK}`, text: RUN1_HOOK, isError: true }
const RUN2_DIR = '/var/folders/xx/T/tmp.s2120Q0dQO'
const RUN2 = `d=${RUN2_DIR}; env -u CODEX_API_KEY -u OPENAI_API_KEY codex exec --sandbox read-only -m gpt-6.1-sol -c model_reasoning_effort="medium" --ephemeral -C /Users/k/workspace -o $d/out.txt - < $d/q.md 2> $d/stderr.log >/dev/null; echo exit=$?; cat $d/out.txt; echo ---; head -15 $d/stderr.log`
const RUN2_STDOUT =
  'exit=0\nOK---\nOpenAI Codex v0.169.0\n--------\nworkdir: /Users/k/workspace\nmodel: gpt-6.1-sol\nprovider: openai\napproval: never\nsandbox: read-only\nreasoning effort: medium\nreasoning summaries: none\nsession id: 01a1ddd5-048f-7290-89ca-a290d475b994\n--------\nuser\nOK とだけ返して\n\ncodex'
const RUN2_RESULT = {
  ref: 2,
  result: { stdout: RUN2_STDOUT, stderr: '', interrupted: false, isImage: false, noOutputExpected: false },
  text: RUN2_STDOUT,
}
// Another session the same day: the images went in through a shell variable, Codex
// stopped on its own usage error, and `echo exit $?` kept Bash from seeing exit code 2
const USAGE =
  'cd /Users/k/work/slides/case; S=/private/tmp/scratch/cx\nI=""; for f in png/a.png png/b.png; do I="$I -i $f"; done\nenv -u CODEX_API_KEY -u OPENAI_API_KEY codex exec --sandbox read-only -m gpt-6.1-sol -c model_reasoning_effort="xhigh" --ephemeral -C $PWD -o $S/out.md $I - < $S/q.md > $S/stdout.log 2> $S/stderr.log; echo exit $?; wc -c $S/out.md; tail -5 $S/stderr.log'
const USAGE_STDOUT =
  "exit 2\nwc: /private/tmp/scratch/cx/out.md: open: No such file or directory\n\nUsage: codex exec [OPTIONS] [PROMPT]\n       codex exec [OPTIONS] <COMMAND> [ARGS]\n\nFor more information, try '--help'."
const USAGE_RESULT = { ref: 3, result: { stdout: USAGE_STDOUT, stderr: '', interrupted: false, isImage: false, noOutputExpected: false }, text: USAGE_STDOUT }
const MOVED = 'Command was moved to the background (ID: blkpf6i43) after running for 180s. Output is being written to: /private/tmp/tasks/blkpf6i43.output.'
const MOVED_RESULT = {
  ref: 4,
  result: { stdout: '', stderr: '', interrupted: false, isImage: false, noOutputExpected: false, backgroundTaskId: 'blkpf6i43', timedOutAfterMs: 180000, subagentCapApplied: true },
  text: MOVED,
}

// A rough text dump of a drawn subtree: a column box gives one line per child, a
// row box joins its children; the absolute frame pieces are left out
function linesOf(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  const n = node as Drawn
  if (n.type === 'Text') return [textOf(n)]
  if (n.type === 'Button') return [String(n.props?.label ?? textOf(n))]
  const kids = (n.children ?? []).filter(c => !(c && typeof c === 'object' && (c as Drawn).props?.position === 'absolute'))
  if (n.props?.flexDirection === 'row') return [kids.map(k => linesOf(k).join(' ')).join('')]
  return kids.flatMap(linesOf)
}

function framed(lines: string[], width: number): string {
  const inner = width - 2
  const pad = (line: string) => line + ' '.repeat(Math.max(0, inner - [...line].length))
  return [`┌${'─'.repeat(inner)}┐`, ...lines.map(line => `│${pad(line)}│`), `└${'─'.repeat(inner)}┘`].join('\n')
}

function inside(drawn: unknown, outer: string, inner: string): string[] | undefined {
  const box = findKey(drawn, outer)
  const block = box ? findKey(box, inner) : undefined
  return block ? linesOf(block) : undefined
}

async function agentDone($: Engine) {
  await $.turn.complete({ answer: 'Codex says: fix 1 first.', durationMs: 900, isAborted: false, turnId: 't1', agentId: 'sub-1', reason: 'answer' } as never)
}

describe('Codex runs: what the Bash call came back as (shapes from a real session)', () => {
  test('-o through a variable the command set: known when it is a path, open when it is $(mktemp -d)', () => {
    expect(parseCodexCommand(RUN2)).toMatchObject({ model: 'gpt-6.1-sol', effort: 'medium', output: `${RUN2_DIR}/out.txt` })
    expect(parseCodexCommand(RUN1)?.output).toBe('$d/out.txt')
    expect(parseCodexCommand(USAGE)).toMatchObject({ output: '/private/tmp/scratch/cx/out.md', cwd: '/Users/k/work/slides/case', effort: 'xhigh' })
    expect(parseCodexCommand('export T=/tmp/a && codex exec -o ${T}/o.md -')?.output).toBe('/tmp/a/o.md')
    expect(expandVariables('$HOME/x/$NOPE', { HOME: '/Users/k' })).toBe('/Users/k/x/$NOPE')
  })

  test('the outcome: a hook refusal is blocked, Exit code N failed, a hidden usage error failed, the rest done', () => {
    expect(codexOutcome(RUN1_RESULT, false)).toEqual({ status: 'blocked', text: RUN1_HOOK })
    expect(codexOutcome({ result: 'Error: Exit code 1\nerror: model x', text: 'Exit code 1\nerror: model x', isError: true }, false).status).toBe('failed')
    expect(codexOutcome({ result: 'Error: Permission for this action was denied by the Claude Code auto mode classifier.', isError: true }, false).status).toBe('blocked')
    expect(codexOutcome({ deny: 'not here' }, false)).toEqual({ status: 'blocked', text: 'not here' })
    expect(codexOutcome(RUN2_RESULT, true)).toEqual({ status: 'done', text: RUN2_STDOUT })
    expect(codexOutcome(USAGE_RESULT, false).status).toBe('failed')
    expect(codexOutcome(USAGE_RESULT, true).status).toBe('done')
    expect(codexOutcome(MOVED_RESULT, false).status).toBe('background')
    expect(codexOutcome({ result: { stdout: '', interrupted: true }, text: '' }, false).status).toBe('stopped')
  })

  test('the session replayed: run 1 blocked by the hook, run 2 done with the answer from $d/out.txt', en, async ($, on) => {
    const seen = engine(on)
    on('classic.PreToolUse', (_, e) => (String((e as { command?: unknown }).command ?? '').includes('mktemp') ? { deny: RUN1_HOOK } : {}) as never)
    await withCodexAgent($)
    await $.tool.call({ tool: 'Bash', command: RUN1, agentId: 'sub-1' } as never)
    seen.answer({ raw: RUN2_RESULT, writes: { [`${RUN2_DIR}/out.txt`]: 'OK' } })
    await $.tool.call({ tool: 'Bash', command: RUN2, agentId: 'sub-1' } as never)
    const [first, second] = seen.tree().codex ?? []
    expect(first).toMatchObject({ status: 'blocked', model: 'gpt-6.1-sol', answerFrom: 'deny' })
    expect(first?.output).toBeUndefined()
    expect(second).toMatchObject({ status: 'done', model: 'gpt-6.1-sol', effort: 'medium', answer: 'OK', answerFrom: 'file', output: `${RUN2_DIR}/out.txt` })
    expect(seen.bashCalls).toEqual([RUN2])
  })

  test('the core-shaped refusal and the usage error hidden by echo', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ raw: RUN1_RESULT })
    await $.tool.call({ tool: 'Bash', command: RUN1, agentId: 'sub-1' } as never)
    seen.answer({ raw: USAGE_RESULT })
    await $.tool.call({ tool: 'Bash', command: USAGE, agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.map(r => r.status)).toEqual(['blocked', 'failed'])
    expect(seen.tree().codex?.[1]?.answer).toContain('Usage: codex exec')
  })

  test('a run Bash moved to the background ends at the caller\'s next tool call once its file is there', en, async ($, on) => {
    const files: Record<string, FileEntry> = {}
    const seen = engine(on, files)
    await withCodexAgent($)
    seen.answer({ raw: MOVED_RESULT })
    await $.tool.call({ tool: 'Bash', command: EXEC, agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]).toMatchObject({ status: 'running', background: true })
    await $.tool.call({ tool: 'Bash', command: 'sleep 10', agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]?.status).toBe('running')
    files['/tmp/cx.Ab12/answer.md'] = { text: ANSWER, mtimeMs: 99_000 }
    await $.tool.call({ tool: 'Bash', command: 'ls /tmp/cx.Ab12', agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]).toMatchObject({ status: 'done', answerFrom: 'file', answerLines: 7 })
  })
})

describe('Codex runs: drawn inside the caller\'s frame', () => {
  test('inside a sub-agent\'s box, while Codex runs and once it is done; no CODEX section below', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    const gate = seen.holdNext()
    seen.answer({ writes: { '/tmp/cx.Ab12/answer.md': ANSWER } })
    const call = $.tool.call({ tool: 'Bash', command: EXEC, description: 'Ask Codex', agentId: 'sub-1' } as never)
    await gate.arrived
    const ui = await $.ui.mount(pane(90))
    const drawn = await ui.drawn()
    const during = inside(drawn, 'ag:sub-1', 'codex-in:sub-1') ?? []
    console.log(`\n--- sub-agent box while Codex runs (90 columns) ---\n${framed(linesOf(findKey(drawn, 'ag:sub-1')), 19)}`)
    // "Sonnet 5.5 + ◇ gpt-5.5" is wider than the box: the Codex model takes the line
    // right under the Claude model, the run below names no model again
    expect(linesOf(findKey(drawn, 'ag:sub-1')).slice(1, 3)).toEqual(['Sonnet 5.5', '+ ◇ gpt-5.5'])
    expect(during[0]).toMatch(/^high · ◐ \d+ s$/)
    expect(during).toHaveLength(1)
    expect(findKey(drawn, 'codex')).toBeUndefined()
    await ui.unmount()
    gate.release()
    await call
    await agentDone($)
    const after = await $.ui.mount(pane(90))
    const done = await after.drawn()
    const lines = inside(done, 'ag:sub-1', 'codex-in:sub-1') ?? []
    console.log(`\n--- sub-agent box, done (90 columns) ---\n${framed(linesOf(findKey(done, 'ag:sub-1')), 19)}`)
    expect(linesOf(findKey(done, 'ag:sub-1'))[2]).toBe('+ ◇ gpt-5.5')
    expect(lines[0]).toMatch(/^high · ● \d+ s ▸$/)
    expect(lines[1]).toBe('│ ## Findings')
    for (const line of linesOf(findKey(done, 'ag:sub-1'))) expect([...line].length).toBeLessThanOrEqual(17)
    expect(findKey(done, 'codex')).toBeUndefined()
    await after.unmount()
  })

  test('under a one-line agent row in a narrow pane, running and done', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    const gate = seen.holdNext()
    seen.answer({ raw: RUN2_RESULT, writes: { [`${RUN2_DIR}/out.txt`]: 'OK' } })
    const call = $.tool.call({ tool: 'Bash', command: RUN2, agentId: 'sub-1' } as never)
    await gate.arrived
    const ui = await $.ui.mount(pane(40))
    const running = await ui.drawn()
    const rowsRunning = linesOf(findKey(running, 'rows'))
    console.log(`\n--- one-line rows while Codex runs (40 columns) ---\n${rowsRunning.join('\n')}`)
    expect(rowsRunning[0]).toMatch(/◐ running · connector-codex/)
    expect(rowsRunning[1]).toBe('  Sonnet 5.5 + ◇ Codex gpt-6.1-sol')
    expect(rowsRunning[2]).toMatch(/^ {4}◇ medium · exec · ◐ running \d+ s$/)
    expect(rowsRunning).toHaveLength(3)
    await ui.unmount()
    gate.release()
    await call
    await agentDone($)
    const after = await $.ui.mount(pane(40))
    const done = await after.drawn()
    const rows = linesOf(findKey(done, 'rows'))
    console.log(`\n--- one-line rows, the agent done (40 columns) ---\n${rows.join('\n')}`)
    expect(rows[0]).toMatch(/● done · connector-codex/)
    expect(rows[1]).toBe('  Sonnet 5.5 + ◇ Codex gpt-6.1-sol')
    expect(rows[2]).toBe('    ◇ medium · exec ▸')
    expect(rows[3]).toMatch(/^ {6}● done \d+ s · 1 line$/)
    expect(rows[4]).toBe('      │ OK')
    for (const line of rows) expect([...line].length).toBeLessThanOrEqual(39)
    expect(findKey(done, 'codex')).toBeUndefined()
    await after.unmount()
  })

  test('the time shown is the time Bash spent on the run: 6 s for the 6.2 s run of the session', en, async ($, on) => {
    const time = mock.clock(on, { now: 1_763_186_486_335 })
    const seen = engine(on)
    await withCodexAgent($)
    const gate = seen.holdNext()
    seen.answer({ raw: RUN2_RESULT, writes: { [`${RUN2_DIR}/out.txt`]: 'OK' } })
    const call = $.tool.call({ tool: 'Bash', command: RUN2, agentId: 'sub-1' } as never)
    await gate.arrived
    await time.advance(6_247)
    gate.release()
    await call
    const run = seen.tree().codex?.[0]
    expect((run?.endedAt ?? 0) - (run?.startedAt ?? 0)).toBe(6_247)
    const ui = await $.ui.mount(pane(40))
    expect(linesOf(findKey(await ui.drawn(), 'codex-in:sub-1'))[2]).toBe('      ● done 6 s · 1 line')
    await ui.unmount()
  })

  test('a blocked run reads blocked with the hook\'s reason, not failed 0 s', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ raw: RUN1_RESULT })
    await $.tool.call({ tool: 'Bash', command: RUN1, agentId: 'sub-1' } as never)
    const ui = await $.ui.mount(pane(40))
    const rows = linesOf(findKey(await ui.drawn(), 'codex-in:sub-1'))
    console.log(`\n--- a blocked run under its agent (40 columns) ---\n${rows.join('\n')}`)
    expect(rows[0]).toBe('  Sonnet 5.5 + ◇ Codex gpt-6.1-sol')
    expect(rows[1]).toBe('    ◇ medium · exec ▸')
    expect(rows[2]).toMatch(/^ {6}○ blocked/)
    expect(rows.join('\n')).not.toMatch(/failed|0 s/)
    expect(rows[3]).toMatch(/^ {6}│ PreToolUse:Bash hook error/)
    await ui.unmount()
  })

  test('inside the main session\'s box when the main session runs Codex', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ stdout: 'No issues found.\nLooks good.' })
    await $.tool.call({ tool: 'Bash', command: REVIEW } as never)
    for (const columns of [90, 40]) {
      const ui = await $.ui.mount(pane(columns))
      const drawn = await ui.drawn()
      const lines = inside(drawn, 'main', 'codex-in:main') ?? []
      if (columns === 90) console.log(`\n--- main session box (90 columns) ---\n${framed(linesOf(findKey(drawn, 'main')), 31)}`)
      expect(lines[0]).toBe('◇ Codex · gpt-5.5-codex ▸')
      expect(lines[1]).toMatch(/^xhigh · ● done \d+ s · review/)
      for (const line of lines) expect([...line].length).toBeLessThanOrEqual(29)
      expect(lines[2]).toBe('│ No issues found.')
      expect(findKey(drawn, 'codex-in:sub-1')).toBeUndefined()
      await ui.unmount()
    }
  })

  test('a press opens the whole answer below the tree; a press on its head closes it', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ writes: { '/tmp/cx.Ab12/answer.md': ANSWER } })
    await $.tool.call({ tool: 'Bash', command: EXEC, agentId: 'sub-1' } as never)
    const run = seen.tree().codex?.[0]
    const ui = await $.ui.mount(pane(90))
    await ui.press({ key: `codex:${run?.id}` })
    const open = linesOf(findKey(await ui.drawn(), 'codex'))
    console.log(`\n--- the opened answer below the tree (90 columns) ---\n${open.join('\n')}`)
    expect(open[0]).toMatch(/^◇ Codex · connector-codex · Codex review · gpt-5\.5 · high · exec · ● done \d+ s ▾$/)
    expect(open).toContain('  │ Overall: fix 1 before merging.')
    expect(open.at(-1)).toBe('  │ file: /tmp/cx.Ab12/answer.md')
    expect(inside(await ui.drawn(), 'ag:sub-1', 'codex-in:sub-1')?.[0]).toMatch(/^high · ● \d+ s ▾$/)
    await ui.press({ key: `codex-open:${run?.id}` })
    expect(findKey(await ui.drawn(), 'codex')).toBeUndefined()
    await ui.unmount()
  })

  test('a 44-column, 30-row pane on terminal and desktop draws boxes and keeps every Codex line inside them', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ writes: { '/tmp/cx.Ab12/answer.md': ANSWER } })
    await $.tool.call({ tool: 'Bash', command: EXEC, agentId: 'sub-1' } as never)
    seen.answer({ stdout: 'No issues found.' })
    await $.tool.call({ tool: 'Bash', command: REVIEW } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...pane(44, 30), surface })
      const drawn = await ui.drawn()
      const rows = linesOf(findKey(drawn, 'ag:sub-1'))
      const main = linesOf(findKey(drawn, 'codex-in:main'))
      if (surface === 'terminal') console.log(`\n--- narrow and short (44 columns, 30 rows) ---\n${rows.join('\n')}\n[main box]\n${main.join('\n')}`)
      expect(modeOf(drawn)).toBe('boxes')
      expect(rows[2]).toBe('+ ◇ gpt-5.5')
      expect(linesOf(findKey(drawn, 'codex-in:sub-1'))).toEqual([expect.stringMatching(/^high · ● \d+ s ▸$/), '│ ## Findings'])
      for (const line of rows) expect([...line].length).toBeLessThanOrEqual(17)
      for (const line of main) expect([...line].length).toBeLessThanOrEqual(29)
      await ui.unmount()
    }
  })

  test('the row plan counts every Codex line, and what it plans fits the height', () => {
    const rows: RowPlanInput = { height: 30, wide: false, tight: true, asRows: true, perRow: 1, total: 3, advisorRows: 4, earlier: false, helpRows: 0 }
    const boxes: RowPlanInput = { height: 60, wide: false, tight: false, asRows: false, perRow: 2, total: 4, advisorRows: 4, earlier: false, helpRows: 1 }
    expect(usedRows({ ...rows, extraRows: [2, 2, 2], mainRows: 3 }, 3, undefined)).toBe(usedRows(rows, 3, undefined) + 9)
    expect(usedRows({ ...rows, extraRows: [2, 2, 2] }, 2, undefined)).toBe(usedRows(rows, 2, undefined) + 4)
    // boxes side by side grow to the tallest of their row
    expect(usedRows({ ...boxes, extraRows: [3, 1, 0, 2] }, 4, undefined)).toBe(usedRows(boxes, 4, undefined) + 3 + 2)
    expect(usedRows({ ...boxes, codexRows: 10 }, 4, undefined)).toBe(usedRows(boxes, 4, undefined) + 10)
    for (const o of [rows, boxes]) {
      for (const extra of [0, 2, 3, 5]) {
        const input = { ...o, extraRows: Array.from({ length: o.total }, () => extra), mainRows: extra ? 3 : 0, codexRows: extra ? 6 : 0 }
        const plan = planRows(input)
        if (plan.advisor === false) continue
        expect(usedRows(input, plan.shown, plan.logRows ? plan.logRows : undefined)).toBeLessThanOrEqual(o.height ?? 0)
      }
    }
  })

  test('commands that only mention codex add no run, and other tools still count', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    for (const command of ['codex login status', 'grep -rn "codex exec" agents/', 'echo codex exec']) {
      await $.tool.call({ tool: 'Bash', command, agentId: 'sub-1' } as never)
    }
    expect(seen.tree().codex ?? []).toEqual([])
    expect(seen.tree().agents[0]?.toolCount).toBe(3)
    const ui = await $.ui.mount(pane(90))
    expect(findKey(await ui.drawn(), 'codex-in:sub-1')).toBeUndefined()
    await ui.unmount()
  })
})

describe('Codex runs: reading the answer', () => {
  test('the review form from the main session, the answer read from the Bash output when no file came', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ stdout: 'No issues found.\nLooks good.' })
    await $.tool.call({ tool: 'Bash', command: REVIEW } as never)
    const run = seen.tree().codex?.[0]
    expect(run).toMatchObject({ kind: 'review', model: 'gpt-5.5-codex', effort: 'xhigh', status: 'done', answerFrom: 'output', answer: 'No issues found.\nLooks good.' })
    expect(run?.agentId).toBeUndefined()
  })

  test('an old output file is not taken for the new answer', en, async ($, on) => {
    const seen = engine(on, { '/tmp/cx.Ab12/answer.md': { text: 'stale answer', mtimeMs: 10 } })
    await withCodexAgent($)
    seen.answer({ stdout: 'fresh answer' })
    await $.tool.call({ tool: 'Bash', command: EXEC, agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]).toMatchObject({ answer: 'fresh answer', answerFrom: 'output' })
  })

  test('a failed run shows as failed with the error text', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ isError: true, text: 'Exit code 1\nerror: model gpt-9 is not available' })
    await $.tool.call({ tool: 'Bash', command: EXEC.replace('gpt-5.5', 'gpt-9'), agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]).toMatchObject({ status: 'failed', model: 'gpt-9', answerFrom: 'output' })
    const ui = await $.ui.mount(pane(90))
    const lines = inside(await ui.drawn(), 'ag:sub-1', 'codex-in:sub-1') ?? []
    expect(lines[0]).toMatch(/✗ \d+ s/)
    expect(lines[1]).toBe('│ Exit code 1')
    await ui.unmount()
  })

  test('no -m: the model comes from ~/.codex/config.toml, or reads Default', en, async ($, on) => {
    const seen = engine(on, { '/Users/k/.codex/config.toml': { text: 'model = "gpt-5.5"\n', mtimeMs: 1 } })
    await withCodexAgent($)
    seen.answer({ stdout: 'ok' })
    await $.tool.call({ tool: 'Bash', command: 'codex exec --ephemeral -o /t/a.md - < /t/q.md', agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]).toMatchObject({ model: 'gpt-5.5', modelFrom: 'config' })
  })

  test('without a config the model reads Default', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ stdout: 'ok' })
    await $.tool.call({ tool: 'Bash', command: 'codex exec --ephemeral -', agentId: 'sub-1' } as never)
    expect(seen.tree().codex?.[0]?.model).toBeUndefined()
    const ui = await $.ui.mount(pane(90))
    expect(inside(await ui.drawn(), 'ag:sub-1', 'codex-model:sub-1')).toEqual(['+ ◇ Default'])
    await ui.unmount()
  })

  test('a run sent to the background ends when its file appears or its agent ends', en, async ($, on) => {
    const files: Record<string, FileEntry> = {}
    const seen = engine(on, files)
    await withCodexAgent($)
    seen.answer({ background: true })
    await $.tool.call({ tool: 'Bash', command: EXEC, agentId: 'sub-1', run_in_background: true } as never)
    expect(seen.tree().codex?.[0]).toMatchObject({ status: 'running', background: true })
    files['/tmp/cx.Ab12/answer.md'] = { text: 'late answer', mtimeMs: 99_000 }
    await $.turn.complete({ answer: 'OK', durationMs: 900, isAborted: false, turnId: 't1', agentId: 'sub-1', reason: 'answer' })
    expect(seen.tree().codex?.[0]).toMatchObject({ status: 'done', answer: 'late answer', answerFrom: 'file' })
  })
})

// A rough screen of a drawn tree, for counting rows and columns: borders take a
// row and a column on each side, a centered column centers its children, a row
// box sets its children side by side (wrapping when it may), truncate-end cuts
const len = (s: string) => [...s].length
const padTo = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - len(s)))
function screenOf(node: unknown, room: number): string[] {
  if (node === null || node === undefined || node === false) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(k => screenOf(k, room))
  if (typeof node !== 'object') return []
  const n = node as Drawn
  const p = n.props ?? {}
  if (p.position === 'absolute') return []
  if (n.type === 'Text' || n.type === 'Button') {
    const text = n.type === 'Button' ? String(p.label ?? textOf(n)) : textOf(n)
    return [p.wrap === 'truncate-end' && len(text) > room ? [...text].slice(0, Math.max(0, room - 1)).join('') + '…' : text]
  }
  const own = typeof p.width === 'number' ? p.width : undefined
  const border = p.borderStyle ? 1 : 0
  const padX = border ? 0 : Number(p.paddingX ?? 0)
  const padY = border ? 0 : Number(p.paddingY ?? 0)
  const outer = own ?? room
  const inner = Math.max(0, outer - 2 * border - 2 * padX)
  const kids = (n.children ?? []).filter(c => c !== null && c !== undefined && c !== false && !(typeof c === 'object' && (c as Drawn).props?.position === 'absolute'))
  let body: string[]
  if (p.flexDirection === 'row') {
    const blocks = kids.map(k => {
      const kp = (typeof k === 'object' && k ? (k as Drawn).props : undefined) ?? {}
      const lines = screenOf(k, inner)
      const w = typeof kp.width === 'number' ? kp.width : Math.max(0, ...lines.map(len))
      return { lines, w: w + Number(kp.marginLeft ?? 0), left: Number(kp.marginLeft ?? 0) }
    })
    const gap = Number(p.columnGap ?? 0)
    const rows: (typeof blocks)[] = [[]]
    let used = 0
    for (const b of blocks) {
      const add = (rows.at(-1)?.length ? gap : 0) + b.w
      if (p.flexWrap === 'wrap' && used + add > inner && rows.at(-1)?.length) {
        rows.push([])
        used = 0
      }
      rows.at(-1)?.push(b)
      used += (rows.at(-1)!.length > 1 ? gap : 0) + b.w
    }
    body = rows.flatMap(row => {
      const h = Math.max(0, ...row.map(b => b.lines.length))
      return Array.from({ length: h }, (_, i) => row.map(b => padTo(' '.repeat(b.left) + (b.lines[i] ?? ''), b.w)).join(' '.repeat(gap)))
    })
  } else {
    const gap = Number(p.rowGap ?? 0)
    body = []
    kids.forEach((k, i) => {
      const kp = (typeof k === 'object' && k ? (k as Drawn).props : undefined) ?? {}
      if (i && gap) body.push(...Array.from({ length: gap }, () => ''))
      const lines = screenOf(k, inner)
      for (let m = 0; m < Number(kp.marginTop ?? 0); m++) body.push('')
      if (p.alignItems === 'center') {
        const w = typeof kp.width === 'number' ? kp.width : Math.max(0, ...lines.map(len))
        const left = Math.max(0, Math.floor((inner - w) / 2))
        body.push(...lines.map(l => ' '.repeat(left) + l))
      } else body.push(...lines)
    })
  }
  body = [...Array.from({ length: padY }, () => ''), ...body, ...Array.from({ length: padY }, () => '')].map(l => ' '.repeat(padX) + l)
  if (!border) return body
  return [`┌${'─'.repeat(inner)}┐`, ...body.map(l => `│${padTo(l, inner)}│`), `└${'─'.repeat(inner)}┘`]
}

const modeOf = (drawn: unknown) => (findKey(drawn, 'boxes') ? 'boxes' : findKey(drawn, 'rows') ? 'rows' : 'none')

// the line of a box's screen that holds `text`, for where it lands in a low pane
const rowOf = (lines: readonly string[], text: string) => lines.findIndex(line => line.includes(text))

describe('A low pane draws boxes too; what it cannot hold, its body scrolls to', () => {
  test('58 x 22: the connector-codex box with both models and its Codex lines, running and done', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    const gate = seen.holdNext()
    seen.answer({ raw: RUN2_RESULT, writes: { [`${RUN2_DIR}/out.txt`]: 'OK' } })
    const call = $.tool.call({ tool: 'Bash', command: RUN2, agentId: 'sub-1' } as never)
    await gate.arrived
    const check = async (label: string, codex: string[]) => {
      const ui = await $.ui.mount(pane(58, 22))
      const drawn = await ui.drawn()
      const lines = screenOf(drawn, 58)
      console.log(`\n--- ${label} (58 columns, 22 rows; ${lines.length} rows drawn, the rest scrolls) ---\n${lines.join('\n')}`)
      expect(modeOf(drawn)).toBe('boxes')
      const box = linesOf(findKey(drawn, 'ag:sub-1'))
      expect(box.slice(1, 3)).toEqual(['Sonnet 5.5', '+ ◇ gpt-6.1-sol'])
      expect(inside(drawn, 'ag:sub-1', 'codex-in:sub-1')).toEqual(codex)
      for (const line of box) expect(len(line)).toBeLessThanOrEqual(17)
      for (const line of lines) expect(len(line)).toBeLessThanOrEqual(58)
      // from the top: the heading, the main session, then the agent's box with
      // both models inside the first 22 rows; the run's own lines may need a scroll
      expect(rowOf(lines, 'AGENT TREE')).toBe(0)
      expect(rowOf(lines, 'Main session')).toBeLessThan(rowOf(lines, 'connector-codex'))
      expect(rowOf(lines, '+ ◇ gpt-6.1-sol')).toBeLessThan(22)
      await ui.unmount()
    }
    await check('the box while Codex runs', [`medium · ◐ 0 s`])
    gate.release()
    await call
    await agentDone($)
    await check('the box, done', ['medium · ● 0 s ▸', '│ OK'])
    // the user's pane is wider (about 100 columns): the same box
    const wide = await $.ui.mount(pane(108, 22))
    expect(modeOf(await wide.drawn())).toBe('boxes')
    await wide.unmount()
  })

  test('both models on one line where they fit; an agent without Codex keeps its model line alone', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ stdout: 'ok' })
    await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-5 --ephemeral -', agentId: 'sub-1' } as never)
    const s = seen.tree()
    expect(codexBeside(s, 'sub-1', look, 'Opus 5', 17)).toBe(' + ◇ gpt-5')
    expect(codexBeside(s, 'sub-1', look, 'Sonnet 5.5', 17)).toBeUndefined()
    expect(codexInline(s, 'sub-1', 'box', look, 17, 'Opus 5').map(l => l.text)).toEqual(['● 0 s ▸', '│ ok'])
    expect(codexInline(s, 'sub-1', 'box', look, 17, 'Sonnet 5.5').map(l => l.text)).toEqual(['+ ◇ gpt-5', '● 0 s ▸', '│ ok'])
    await $.agent.spawn({ prompt: 'Look.', description: 'Look', subagentType: 'Explore' } as never)
    const ui = await $.ui.mount(pane(58, 22))
    const drawn = await ui.drawn()
    expect(linesOf(findKey(drawn, 'ag:sub-2'))[1]).toBe('Sonnet 5.5')
    expect(findKey(drawn, 'codex-in:sub-2')).toBeUndefined()
    await ui.unmount()
  })

  test('only a short width draws one line each, the two models named together under the row', en, async ($, on) => {
    const seen = engine(on)
    await withCodexAgent($)
    seen.answer({ raw: RUN2_RESULT, writes: { [`${RUN2_DIR}/out.txt`]: 'OK' } })
    await $.tool.call({ tool: 'Bash', command: RUN2, agentId: 'sub-1' } as never)
    await agentDone($)
    for (const rows of [22, 60]) {
      const ui = await $.ui.mount(pane(40, rows))
      const drawn = await ui.drawn()
      expect(modeOf(drawn)).toBe('rows')
      const lines = linesOf(findKey(drawn, 'rows'))
      if (rows === 22) console.log(`\n--- one line each (40 columns) ---\n${lines.join('\n')}`)
      expect(lines[1]).toBe('  Sonnet 5.5 + ◇ Codex gpt-6.1-sol')
      for (const line of lines) expect(len(line)).toBeLessThanOrEqual(39)
      await ui.unmount()
    }
    // more agents than a low pane holds still draw as boxes
    for (let i = 2; i <= 4; i++) await $.agent.spawn({ prompt: 'Look.', description: `Look ${i}`, subagentType: 'Explore' } as never)
    const many = await $.ui.mount(pane(58, 22))
    expect(modeOf(await many.drawn())).toBe('boxes')
    await many.unmount()
  })
})
