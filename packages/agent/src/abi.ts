import { keccak256, parseAbi, toBytes } from 'viem'

/** Minimal PollenTokenV2 ABI (contracts/src/PollenTokenV2.sol). */
export const POLLEN_TOKEN_V2_ABI = parseAbi([
  'function mintBatch(address[] recipients, uint256[] amounts, uint256 epoch) external',
  'function currentEpoch() view returns (uint256)',
  'function epochPool(uint256 epoch) pure returns (uint256)',
  'function mintedInEpoch(uint256 epoch) view returns (uint256)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
])

/** keccak256("MINTER_ROLE") — must be held by the Splits subaccount. */
export const MINTER_ROLE = keccak256(toBytes('MINTER_ROLE'))
