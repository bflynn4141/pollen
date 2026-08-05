// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PollenTokenV2
 * @notice ERC-20 token representing developer contribution scores, with
 *         MasterChef-style USDC revenue sharing and on-chain weekly epochs.
 *
 * Fixes over v1 (0xFa8B0e3DcC0788d4a6b5fEEFBe9FF03f596DD2ED):
 *  - Revenue accounting is centralized in a single `_update` override:
 *    each affected account is settled (pending credited, debt synced)
 *    exactly once per balance change. v1's external `mint()` pre-called
 *    `_updateRevenue(to)` and then `_update` called it again before the
 *    debt refresh, double-crediting pending revenue.
 *  - `claimRevenue()` syncs `revenueDebt` after paying out. v1 zeroed
 *    pending but never refreshed debt, so repeat claims re-credited the
 *    same accrual and drained the contract.
 *
 * Adds over v1:
 *  - AccessControl: MINTER_ROLE mints weekly epoch payouts via
 *    `mintBatch`; DEFAULT_ADMIN_ROLE performs the one-time v1 supply
 *    migration via `mint` (capped at MIGRATION_CAP total).
 *  - On-chain epochs: 1-based, 7 days each, starting at EPOCH_ZERO.
 *    `epochPool(n)` halves every 13 epochs (~quarterly). `mintBatch`
 *    only pays the just-closed epoch and cannot exceed its pool.
 */
contract PollenTokenV2 is ERC20, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice USDC on Base — the revenue distribution token
    IERC20 public immutable revenueToken;

    uint256 private constant PRECISION = 1e30;

    // ── Epochs ──────────────────────────────────────────────

    /// @notice 2026-02-24 00:00:00 UTC — start of epoch 1
    uint256 public immutable EPOCH_ZERO = 1771891200;

    /// @notice Each epoch lasts 7 days
    uint256 public constant EPOCH_LENGTH = 7 days;

    /// @notice Lifetime cap on admin migration mints (v1 supply: 50k + 5k)
    uint256 public constant MIGRATION_CAP = 55_000e18;

    /// @notice POLLEN minted per epoch via mintBatch
    mapping(uint256 => uint256) public mintedInEpoch;

    /// @notice Total minted so far through the admin migration path
    uint256 public migrationMinted;

    // ── Revenue accounting ──────────────────────────────────

    /// @notice Accumulated revenue per token (scaled by PRECISION)
    uint256 public accRevenuePerShare;

    /// @notice Settled-but-unclaimed revenue per holder
    mapping(address => uint256) public pendingRevenue;

    /// @notice Revenue debt for accumulated-reward accounting
    mapping(address => uint256) public revenueDebt;

    // ── Events ──────────────────────────────────────────────

    event RevenueDeposited(address indexed depositor, uint256 amount);
    event RevenueClaimed(address indexed holder, uint256 amount);
    event EpochMinted(uint256 indexed epoch, uint256 amount, uint256 recipients);
    event MigrationMinted(address indexed to, uint256 amount);

    constructor(
        address _revenueToken,
        address admin,
        address minter,
        address[] memory migrationRecipients,
        uint256[] memory migrationAmounts
    ) ERC20("Pollen", "POLLEN") {
        require(_revenueToken != address(0), "revenue token is zero");
        require(admin != address(0), "admin is zero");
        require(minter != address(0), "minter is zero");
        require(migrationRecipients.length == migrationAmounts.length, "migration length mismatch");
        revenueToken = IERC20(_revenueToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);

        for (uint256 i = 0; i < migrationRecipients.length; i++) {
            _migrationMint(migrationRecipients[i], migrationAmounts[i]);
        }
    }

    // ── Epochs ──────────────────────────────────────────────

    /// @notice Current epoch number, 1-based (epoch 1 starts at EPOCH_ZERO)
    function currentEpoch() public view returns (uint256) {
        require(block.timestamp >= EPOCH_ZERO, "before epoch zero");
        return (block.timestamp - EPOCH_ZERO) / EPOCH_LENGTH + 1;
    }

    /// @notice POLLEN available to mint for epoch `epoch`; halves every 13 epochs
    function epochPool(uint256 epoch) public pure returns (uint256) {
        require(epoch >= 1, "epoch is 1-based");
        return 100_000e18 >> ((epoch - 1) / 13);
    }

    // ── Minting ─────────────────────────────────────────────

    /**
     * @notice Mint the weekly payout for the just-closed epoch.
     * @dev Only the epoch that ended most recently (currentEpoch() - 1) can
     *      be paid, and total mints for it can never exceed epochPool(epoch).
     */
    function mintBatch(address[] calldata recipients, uint256[] calldata amounts, uint256 epoch)
        external
        onlyRole(MINTER_ROLE)
    {
        require(recipients.length == amounts.length, "length mismatch");
        uint256 cur = currentEpoch();
        require(cur >= 2 && epoch == cur - 1, "not the just-closed epoch");

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        require(mintedInEpoch[epoch] + total <= epochPool(epoch), "epoch pool exceeded");
        mintedInEpoch[epoch] += total;

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
        emit EpochMinted(epoch, total, recipients.length);
    }

    /**
     * @notice One-time v1 supply migration mint (admin only).
     * @dev Not subject to epoch caps, but lifetime-capped at MIGRATION_CAP.
     */
    function mint(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _migrationMint(to, amount);
    }

    function _migrationMint(address to, uint256 amount) internal {
        require(to != address(0), "migration recipient is zero");
        require(amount > 0, "migration amount is zero");
        require(migrationMinted + amount <= MIGRATION_CAP, "migration cap exceeded");
        migrationMinted += amount;
        _mint(to, amount);
        emit MigrationMinted(to, amount);
    }

    // ── Revenue distribution ────────────────────────────────

    /// @notice Deposit USDC revenue for pro-rata distribution to holders
    function depositRevenue(uint256 amount) external {
        require(totalSupply() > 0, "no holders");
        revenueToken.safeTransferFrom(msg.sender, address(this), amount);
        accRevenuePerShare += (amount * PRECISION) / totalSupply();
        emit RevenueDeposited(msg.sender, amount);
    }

    /// @notice View total claimable USDC revenue for an account
    function earned(address account) public view returns (uint256) {
        return pendingRevenue[account] + (balanceOf(account) * accRevenuePerShare) / PRECISION
            - revenueDebt[account];
    }

    /// @notice Claim all accrued USDC revenue
    function claimRevenue() external {
        _settleAccount(msg.sender); // credits accrual to pending AND syncs debt
        uint256 amount = pendingRevenue[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingRevenue[msg.sender] = 0;
        revenueToken.safeTransfer(msg.sender, amount);
        emit RevenueClaimed(msg.sender, amount);
    }

    // ── Internal ────────────────────────────────────────────

    /**
     * @dev Single choke point for revenue accounting. Every balance change
     *      (mint, burn, transfer) settles each affected account at its OLD
     *      balance exactly once, then re-syncs debt at the NEW balance.
     */
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) _settleAccount(from);
        if (to != address(0) && to != from) _settleAccount(to);

        super._update(from, to, value);

        if (from != address(0)) _syncDebt(from);
        if (to != address(0)) _syncDebt(to);
    }

    /// @dev Credit accrued revenue to pending and sync debt (idempotent at a
    ///      fixed balance: a repeat call credits 0).
    function _settleAccount(address account) private {
        uint256 accumulated = (balanceOf(account) * accRevenuePerShare) / PRECISION;
        uint256 accrued = accumulated - revenueDebt[account];
        if (accrued > 0) {
            pendingRevenue[account] += accrued;
        }
        revenueDebt[account] = accumulated;
    }

    /// @dev Reset debt to match the current balance (post-balance-change)
    function _syncDebt(address account) private {
        revenueDebt[account] = (balanceOf(account) * accRevenuePerShare) / PRECISION;
    }
}
