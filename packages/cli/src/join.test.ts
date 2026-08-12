import { describe, expect, it, vi } from 'vitest'
import { joinFoundingPanel } from './join.js'

describe('joinFoundingPanel', () => {
  it('returns a friendly result for an invalid invite without saving credentials', async () => {
    const saveRegistration = vi.fn()

    const result = await joinFoundingPanel('not-a-real-invite', {
      apiUrl: 'https://api.test',
      register: vi.fn(async () => {
        throw new Error('invalid_invite')
      }),
      saveRegistration,
    })

    expect(result).toEqual({
      ok: false,
      message: 'That invite code was not accepted. Check the code and try again.',
    })
    expect(saveRegistration).not.toHaveBeenCalled()
  })

  it('saves a successful registration and returns the contributor id', async () => {
    const register = vi.fn(async () => ({
      contributorId: 'server-contributor',
      token: `pln_${'a'.repeat(43)}`,
    }))
    const saveRegistration = vi.fn()

    const result = await joinFoundingPanel('valid-invite', {
      apiUrl: 'https://api.test',
      register,
      saveRegistration,
    })

    expect(result).toEqual({ ok: true, contributorId: 'server-contributor' })
    expect(register).toHaveBeenCalledWith('valid-invite', 'https://api.test')
    expect(saveRegistration).toHaveBeenCalledWith(
      'server-contributor',
      'https://api.test',
      `pln_${'a'.repeat(43)}`,
    )
  })
})
