import { describe, expect, it } from 'vitest'
import { classifyToolCategory, extractFileExtension, classifyCommand, classifyError, extractMcpServer, extractResponseMeta, extractAction, extractTopic } from './coarsen.js'

describe('classifyToolCategory', () => {
  it('classifies read tools', () => {
    expect(classifyToolCategory('Read')).toBe('read')
  })

  it('classifies write tools', () => {
    expect(classifyToolCategory('Edit')).toBe('write')
    expect(classifyToolCategory('Write')).toBe('write')
    expect(classifyToolCategory('NotebookEdit')).toBe('write')
  })

  it('classifies execute tools', () => {
    expect(classifyToolCategory('Bash')).toBe('execute')
    expect(classifyToolCategory('Task')).toBe('execute')
  })

  it('classifies search tools', () => {
    expect(classifyToolCategory('Grep')).toBe('search')
    expect(classifyToolCategory('Glob')).toBe('search')
    expect(classifyToolCategory('ToolSearch')).toBe('search')
  })

  it('classifies web tools', () => {
    expect(classifyToolCategory('WebFetch')).toBe('web')
    expect(classifyToolCategory('WebSearch')).toBe('web')
  })

  it('classifies interact tools', () => {
    expect(classifyToolCategory('AskUserQuestion')).toBe('interact')
    expect(classifyToolCategory('Skill')).toBe('interact')
  })

  it('classifies MCP tools as interact', () => {
    expect(classifyToolCategory('mcp__clara__wallet_send')).toBe('interact')
    expect(classifyToolCategory('mcp__herd__getBalance')).toBe('interact')
  })

  it('returns unknown for unrecognized tools', () => {
    expect(classifyToolCategory('SomeFutureTool')).toBe('unknown')
  })
})

describe('extractFileExtension', () => {
  it('extracts from file_path', () => {
    expect(extractFileExtension({ file_path: '/src/index.ts' })).toBe('.ts')
    expect(extractFileExtension({ file_path: '/README.md' })).toBe('.md')
    expect(extractFileExtension({ file_path: '/app/page.tsx' })).toBe('.tsx')
  })

  it('extracts from path (Glob)', () => {
    expect(extractFileExtension({ path: '/src/utils.py' })).toBe('.py')
  })

  it('extracts from notebook_path', () => {
    expect(extractFileExtension({ notebook_path: '/analysis.ipynb' })).toBe('.ipynb')
  })

  it('extracts from glob pattern', () => {
    expect(extractFileExtension({ pattern: '**/*.ts' })).toBe('.ts')
    expect(extractFileExtension({ pattern: 'src/**/*.tsx' })).toBe('.tsx')
  })

  it('returns null for no file info', () => {
    expect(extractFileExtension(undefined)).toBeNull()
    expect(extractFileExtension({})).toBeNull()
    expect(extractFileExtension({ command: 'ls' })).toBeNull()
  })

  it('returns null for paths without extensions', () => {
    expect(extractFileExtension({ file_path: '/Makefile' })).toBeNull()
  })
})

describe('classifyCommand', () => {
  it('classifies test commands', () => {
    expect(classifyCommand({ command: 'npm test' })).toBe('test')
    expect(classifyCommand({ command: 'npx jest --watch' })).toBe('test')
    expect(classifyCommand({ command: 'pytest tests/' })).toBe('test')
    expect(classifyCommand({ command: 'pnpm test' })).toBe('test')
    expect(classifyCommand({ command: 'vitest run' })).toBe('test')
  })

  it('classifies build commands', () => {
    expect(classifyCommand({ command: 'npm run build' })).toBe('build')
    expect(classifyCommand({ command: 'npx tsc --noEmit' })).toBe('build')
    expect(classifyCommand({ command: 'pnpm build' })).toBe('build')
    expect(classifyCommand({ command: 'tsc' })).toBe('build')
  })

  it('classifies lint commands', () => {
    expect(classifyCommand({ command: 'npm run lint' })).toBe('lint')
    expect(classifyCommand({ command: 'npx eslint src/' })).toBe('lint')
  })

  it('classifies git commands', () => {
    expect(classifyCommand({ command: 'git status' })).toBe('git')
    expect(classifyCommand({ command: 'git diff HEAD' })).toBe('git')
  })

  it('classifies deploy commands', () => {
    expect(classifyCommand({ command: 'vercel deploy' })).toBe('deploy')
    expect(classifyCommand({ command: 'wrangler deploy' })).toBe('deploy')
  })

  it('classifies install commands', () => {
    expect(classifyCommand({ command: 'npm install express' })).toBe('install')
    expect(classifyCommand({ command: 'pnpm add vitest' })).toBe('install')
  })

  it('classifies run commands', () => {
    expect(classifyCommand({ command: 'node server.js' })).toBe('run')
    expect(classifyCommand({ command: 'npm run dev' })).toBe('run')
  })

  it('classifies db commands', () => {
    expect(classifyCommand({ command: 'sqlite3 ~/.pollen/local.db' })).toBe('db')
    expect(classifyCommand({ command: 'psql -d mydb' })).toBe('db')
    expect(classifyCommand({ command: 'mongosh' })).toBe('db')
  })

  it('classifies http commands', () => {
    expect(classifyCommand({ command: 'curl https://example.com' })).toBe('http')
    expect(classifyCommand({ command: 'wget https://example.com/file.tar.gz' })).toBe('http')
  })

  it('classifies read commands', () => {
    expect(classifyCommand({ command: 'cat /etc/hosts' })).toBe('read')
    expect(classifyCommand({ command: 'head -n 20 file.txt' })).toBe('read')
    expect(classifyCommand({ command: 'tail -f log.txt' })).toBe('read')
  })

  it('classifies fs commands', () => {
    expect(classifyCommand({ command: 'mkdir -p src/lib' })).toBe('fs')
    expect(classifyCommand({ command: 'rm -rf dist/' })).toBe('fs')
    expect(classifyCommand({ command: 'cp file.ts backup.ts' })).toBe('fs')
    expect(classifyCommand({ command: 'mv old.ts new.ts' })).toBe('fs')
    expect(classifyCommand({ command: 'ls -la' })).toBe('fs')
  })

  it('classifies output commands', () => {
    expect(classifyCommand({ command: 'echo "hello"' })).toBe('output')
    expect(classifyCommand({ command: 'printf "%s\\n" hello' })).toBe('output')
  })

  it('classifies remote commands', () => {
    expect(classifyCommand({ command: 'ssh user@host' })).toBe('remote')
    expect(classifyCommand({ command: 'scp file.tar.gz user@host:~/' })).toBe('remote')
    expect(classifyCommand({ command: 'rsync -avz src/ dest/' })).toBe('remote')
  })

  it('classifies permissions commands', () => {
    expect(classifyCommand({ command: 'chmod 644 file.txt' })).toBe('permissions')
    expect(classifyCommand({ command: 'chown user:group file.txt' })).toBe('permissions')
  })

  it('returns other for unrecognized commands', () => {
    expect(classifyCommand({ command: 'some-unknown-tool' })).toBe('other')
  })

  it('returns null for non-Bash tools', () => {
    expect(classifyCommand(undefined)).toBeNull()
    expect(classifyCommand({ file_path: '/foo.ts' })).toBeNull()
  })
})

describe('extractAction', () => {
  it('extracts fix actions', () => {
    expect(extractAction('fix the TypeError in the login handler')).toBe('fix')
    expect(extractAction('debug this failing test')).toBe('fix')
    expect(extractAction('resolve the merge conflict')).toBe('fix')
  })

  it('extracts create actions', () => {
    expect(extractAction('add a new endpoint for user registration')).toBe('create')
    expect(extractAction('create a migration for the users table')).toBe('create')
    expect(extractAction('implement the webhook handler')).toBe('create')
    expect(extractAction('build the auth middleware')).toBe('create')
  })

  it('extracts update actions', () => {
    expect(extractAction('update the config to use the new API key')).toBe('update')
    expect(extractAction('change the timeout from 30s to 60s')).toBe('update')
  })

  it('extracts understand actions for questions', () => {
    expect(extractAction('explain how the auth flow works')).toBe('understand')
    expect(extractAction('how does the session middleware work?')).toBe('understand')
    expect(extractAction('what is this error about?')).toBe('understand')
  })

  it('extracts deploy actions', () => {
    expect(extractAction('deploy to production')).toBe('deploy')
    expect(extractAction('ship the new feature')).toBe('deploy')
  })

  it('extracts refactor actions', () => {
    expect(extractAction('refactor the database layer')).toBe('refactor')
    expect(extractAction('simplify this function')).toBe('refactor')
  })

  it('returns null for empty/unrecognized input', () => {
    expect(extractAction('')).toBeNull()
    expect(extractAction(undefined as unknown as string)).toBeNull()
  })

  it('ignores actions inside code blocks', () => {
    expect(extractAction('look at this:\n```\nfix broken thing\n```')).toBe('review')
  })
})

describe('extractTopic', () => {
  it('extracts auth topics', () => {
    expect(extractTopic('fix the login form validation')).toBe('auth')
    expect(extractTopic('add JWT token refresh')).toBe('auth')
    expect(extractTopic('the session expired too quickly')).toBe('auth')
  })

  it('extracts database topics', () => {
    expect(extractTopic('create a database migration')).toBe('database')
    expect(extractTopic('the postgres query is slow')).toBe('database')
    expect(extractTopic('update the prisma schema')).toBe('database')
  })

  it('extracts API topics', () => {
    expect(extractTopic('add a new REST endpoint')).toBe('api')
    expect(extractTopic('fix the middleware error handling')).toBe('api')
  })

  it('extracts UI topics', () => {
    expect(extractTopic('style the button component')).toBe('ui')
    expect(extractTopic('fix the responsive layout')).toBe('ui')
  })

  it('extracts web3 topics', () => {
    expect(extractTopic('deploy the smart contract')).toBe('web3')
    expect(extractTopic('check my wallet balance')).toBe('web3')
  })

  it('extracts AI topics', () => {
    expect(extractTopic('tune the LLM prompt')).toBe('ai')
    expect(extractTopic('add an MCP server')).toBe('ai')
  })

  it('returns null for unrecognized topics', () => {
    expect(extractTopic('hello world')).toBeNull()
    expect(extractTopic('')).toBeNull()
  })
})

describe('extractMcpServer', () => {
  it('extracts server name from MCP tool', () => {
    expect(extractMcpServer('mcp__inbox402__inbox402_send')).toBe('inbox402')
    expect(extractMcpServer('mcp__clara__wallet_send')).toBe('clara')
    expect(extractMcpServer('mcp__herd__getWalletOverviewTool')).toBe('herd')
  })

  it('returns null for non-MCP tools', () => {
    expect(extractMcpServer('Read')).toBeNull()
    expect(extractMcpServer('Bash')).toBeNull()
    expect(extractMcpServer('Edit')).toBeNull()
  })
})

describe('extractResponseMeta', () => {
  it('returns null for undefined/empty input', () => {
    expect(extractResponseMeta(undefined)).toBeNull()
  })

  it('classifies short responses', () => {
    const meta = extractResponseMeta('Done.')!
    expect(meta.length_bucket).toBe('short')
    expect(meta.char_count).toBe(5)
    expect(meta.code_block_count).toBe(0)
    expect(meta.has_error_mention).toBe(false)
  })

  it('classifies medium responses', () => {
    const meta = extractResponseMeta('x'.repeat(500))!
    expect(meta.length_bucket).toBe('medium')
  })

  it('classifies long responses', () => {
    const meta = extractResponseMeta('x'.repeat(3000))!
    expect(meta.length_bucket).toBe('long')
  })

  it('classifies very long responses', () => {
    const meta = extractResponseMeta('x'.repeat(6000))!
    expect(meta.length_bucket).toBe('very_long')
  })

  it('counts code blocks', () => {
    const msg = 'Here is code:\n```ts\nconsole.log("hi")\n```\nAnd more:\n```\nfoo\n```'
    const meta = extractResponseMeta(msg)!
    expect(meta.code_block_count).toBe(2)
  })

  it('detects error mentions', () => {
    expect(extractResponseMeta('This will fix the error')!.has_error_mention).toBe(true)
    expect(extractResponseMeta('The build failed')!.has_error_mention).toBe(true)
    expect(extractResponseMeta('All good, no issues')!.has_error_mention).toBe(false)
  })
})

describe('classifyError', () => {
  it('classifies syntax errors', () => {
    expect(classifyError('SyntaxError: Unexpected token')).toBe('syntax')
  })

  it('classifies permission errors', () => {
    expect(classifyError('EACCES: permission denied')).toBe('permission')
  })

  it('classifies not found errors', () => {
    expect(classifyError('ENOENT: no such file or directory')).toBe('not_found')
    expect(classifyError('Module not found: ./missing')).toBe('not_found')
  })

  it('classifies timeout errors', () => {
    expect(classifyError('ETIMEDOUT: request timed out')).toBe('timeout')
  })

  it('classifies test failures', () => {
    expect(classifyError('FAIL src/store.test.ts')).toBe('test_failure')
    expect(classifyError('3 tests failed')).toBe('test_failure')
  })

  it('classifies build failures', () => {
    expect(classifyError('build failed with 2 errors')).toBe('build_failure')
    expect(classifyError('tsc: error TS2322')).toBe('build_failure')
  })

  it('classifies runtime errors', () => {
    expect(classifyError('TypeError: Cannot read property')).toBe('runtime')
    expect(classifyError('ReferenceError: x is not defined')).toBe('runtime')
  })

  it('returns unknown for unrecognized errors', () => {
    expect(classifyError('something went wrong')).toBe('unknown')
    expect(classifyError(undefined)).toBe('unknown')
  })
})
