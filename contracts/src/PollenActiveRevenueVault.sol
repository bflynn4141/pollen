// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPollenEpochClock {
    function currentEpoch() external view returns (uint256);
}

/**
 * @title PollenActiveRevenueVault
 * @notice Holds buyer USDC revenue for weekly Merkle distributions produced by
 *         Pollen's active-holder formula. This contract is an additive V3 path;
 *         it does not modify PollenTokenV2 or its legacy holder claims.
 *
 * Merkle leaves use OpenZeppelin's standard double-hash convention:
 * keccak256(bytes.concat(keccak256(abi.encode(epoch, index, account, amount))))
 */
contract PollenActiveRevenueVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant DEPOSITOR_ROLE = keccak256("DEPOSITOR_ROLE");
    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MIN_CLAIM_WINDOW = 30 days;

    IERC20 public immutable revenueToken;
    IPollenEpochClock public immutable pollenToken;

    struct Distribution {
        bytes32 root;
        uint256 amount;
        uint256 claimed;
        uint256 snapshotBlock;
        uint256 claimDeadline;
        bool expired;
    }

    mapping(uint256 epoch => Distribution) public distributions;
    mapping(uint256 epoch => mapping(uint256 wordIndex => uint256 claimedBits)) private claimedBitMap;

    uint256 public reservedRevenue;

    event RevenueDeposited(address indexed depositor, uint256 amount);
    event DistributionPublished(
        uint256 indexed epoch, bytes32 indexed root, uint256 amount, uint256 snapshotBlock, uint256 claimDeadline
    );
    event RevenueClaimed(uint256 indexed epoch, uint256 indexed index, address indexed account, uint256 amount);
    event DistributionExpired(uint256 indexed epoch, uint256 carryReleased);

    constructor(address _revenueToken, address _pollenToken, address admin, address publisher, address pauser) {
        require(_revenueToken != address(0), "revenue token is zero");
        require(_pollenToken != address(0), "pollen token is zero");
        require(admin != address(0), "admin is zero");
        require(publisher != address(0), "publisher is zero");
        require(pauser != address(0), "pauser is zero");

        revenueToken = IERC20(_revenueToken);
        pollenToken = IPollenEpochClock(_pollenToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PUBLISHER_ROLE, publisher);
        _grantRole(PAUSER_ROLE, pauser);
    }

    /**
     * @notice USDC not committed to an unexpired distribution.
     */
    function availableRevenue() public view returns (uint256) {
        return revenueToken.balanceOf(address(this)) - reservedRevenue;
    }

    /**
     * @notice Pull settled revenue into the vault. Only an approved settlement may call this.
     */
    function depositRevenue(uint256 amount) external onlyRole(DEPOSITOR_ROLE) whenNotPaused nonReentrant {
        require(amount > 0, "amount is zero");
        revenueToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RevenueDeposited(msg.sender, amount);
    }

    /**
     * @notice Reserve revenue under an immutable root for one closed epoch.
     * @dev The publisher is responsible for validating World ID bindings,
     *      the exact epoch-boundary block, source scores, and allocation file.
     *      The stored snapshot block makes that input independently auditable.
     */
    function publishDistribution(
        uint256 epoch,
        bytes32 root,
        uint256 amount,
        uint256 snapshotBlock,
        uint256 claimDeadline
    ) external onlyRole(PUBLISHER_ROLE) whenNotPaused {
        require(epoch > 0 && epoch < pollenToken.currentEpoch(), "epoch is not closed");
        require(distributions[epoch].root == bytes32(0), "distribution exists");
        require(root != bytes32(0), "root is zero");
        require(amount > 0, "amount is zero");
        require(snapshotBlock > 0, "snapshot block is zero");
        require(snapshotBlock <= block.number, "snapshot block is future");
        require(claimDeadline >= block.timestamp + MIN_CLAIM_WINDOW, "claim window too short");
        require(amount <= availableRevenue(), "insufficient unreserved revenue");

        distributions[epoch] = Distribution({
            root: root,
            amount: amount,
            claimed: 0,
            snapshotBlock: snapshotBlock,
            claimDeadline: claimDeadline,
            expired: false
        });
        reservedRevenue += amount;
        emit DistributionPublished(epoch, root, amount, snapshotBlock, claimDeadline);
    }

    function isClaimed(uint256 epoch, uint256 index) public view returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        return claimedBitMap[epoch][wordIndex] & (uint256(1) << bitIndex) != 0;
    }

    function _setClaimed(uint256 epoch, uint256 index) private {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        claimedBitMap[epoch][wordIndex] |= uint256(1) << bitIndex;
    }

    /**
     * @notice Claim one allocation. Any relayer may submit; USDC always goes to `account`.
     */
    function claim(uint256 epoch, uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof)
        external
        whenNotPaused
        nonReentrant
    {
        Distribution storage distribution = distributions[epoch];
        require(distribution.root != bytes32(0), "distribution does not exist");
        require(!distribution.expired && block.timestamp <= distribution.claimDeadline, "claim period ended");
        require(account != address(0), "account is zero");
        require(amount > 0, "amount is zero");
        require(!isClaimed(epoch, index), "already claimed");

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(epoch, index, account, amount))));
        require(MerkleProof.verifyCalldata(merkleProof, distribution.root, leaf), "invalid proof");
        require(distribution.claimed + amount <= distribution.amount, "distribution exceeded");

        _setClaimed(epoch, index);
        distribution.claimed += amount;
        reservedRevenue -= amount;
        revenueToken.safeTransfer(account, amount);
        emit RevenueClaimed(epoch, index, account, amount);
    }

    /**
     * @notice Release an expired distribution's unclaimed amount back into the carry pool.
     */
    function expireDistribution(uint256 epoch) external whenNotPaused {
        Distribution storage distribution = distributions[epoch];
        require(distribution.root != bytes32(0), "distribution does not exist");
        require(!distribution.expired, "distribution expired");
        require(block.timestamp > distribution.claimDeadline, "claim period active");

        uint256 carry = distribution.amount - distribution.claimed;
        distribution.expired = true;
        reservedRevenue -= carry;
        emit DistributionExpired(epoch, carry);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
