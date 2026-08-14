import { saveNetworkRegistration } from './config.js'
import {
  DEFAULT_NETWORK_API_URL,
  registerNetworkContributor,
  type NetworkRegistration,
} from './network-client.js'

const INVALID_INVITE_MESSAGE = 'That invite code was not accepted. Check the code and try again.'

interface JoinDependencies {
  apiUrl: string
  register: (
    inviteCode: string,
    apiUrl: string,
    existingContributorId?: string,
  ) => Promise<NetworkRegistration>
  saveRegistration: (contributorId: string, apiUrl: string, token: string) => void
}

export type JoinResult =
  | { ok: true; contributorId: string }
  | { ok: false; message: string }

const defaultDependencies: JoinDependencies = {
  apiUrl: DEFAULT_NETWORK_API_URL,
  register: (inviteCode, apiUrl, existingContributorId) =>
    registerNetworkContributor(inviteCode, apiUrl, fetch, existingContributorId),
  saveRegistration: saveNetworkRegistration,
}

function isInvalidInviteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.trim().toLowerCase()
  return message === 'invalid_invite' || message === 'invalid invite'
}

export async function joinFoundingPanel(
  inviteCode: string,
  dependencies: JoinDependencies = defaultDependencies,
  existingContributorId?: string,
): Promise<JoinResult> {
  let registration: NetworkRegistration
  try {
    registration = existingContributorId === undefined
      ? await dependencies.register(inviteCode, dependencies.apiUrl)
      : await dependencies.register(inviteCode, dependencies.apiUrl, existingContributorId)
  } catch (error) {
    if (isInvalidInviteError(error)) {
      return { ok: false, message: INVALID_INVITE_MESSAGE }
    }
    throw error
  }

  dependencies.saveRegistration(
    registration.contributorId,
    dependencies.apiUrl,
    registration.token,
  )
  return { ok: true, contributorId: registration.contributorId }
}
