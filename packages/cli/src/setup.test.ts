import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { makePollenHookEntry, runSetup } from './setup.js'

describe('setup', () => {
  it('uses the executable installed by the CLI package for hooks', () => {
    expect(makePollenHookEntry().hooks[0].command).toBe('pollen-hook')
  })

  it('completes the clean-user demo flow using one input stream', async () => {
    const answers = [
      '\n',
      '3\n',
      '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\n',
      'n\n',
    ]
    const input = new PassThrough()
    let output = ''
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString()
        const answer = answers.shift()
        if (answer) setImmediate(() => input.write(answer))
        callback()
      },
    })

    await runSetup(true, { input, output: sink })
    input.end()

    expect(output).toContain('Install hooks?')
    expect(output).toContain('Choice [1]:')
    expect(output).toContain('Verify now?')
  })
})
