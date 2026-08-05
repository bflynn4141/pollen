// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PollenToken
 * @notice ERC-20 token representing developer contribution scores.
 *
 * Owner mints new POLLEN each epoch based on contributor scores.
 * Revenue sharing via depositRevenue() + claimRevenue() — holders
 * earn proportional USDC from x402 query payments.
 */
contract PollenToken is ERC20, Ownable {
    IERC20 public immutable revenueToken; // USDC on Base

    uint256 private constant PRECISION = 1e30;

    /// @notice Accumulated revenue per token (scaled by PRECISION)
    uint256 public accRevenuePerShare;

    /// @notice Pending unclaimed revenue per holder
    mapping(address => uint256) public pendingRevenue;

    /// @notice Revenue debt for accumulated-reward accounting
    mapping(address => uint256) private revenueDebt;

    /// @notice Block number when address first received tokens
    mapping(address => uint256) public holdingSince;

    /// @notice Minimum blocks to hold before claiming revenue (0 = no restriction)
    uint256 public minHoldBlocks;

    event RevenueDeposited(address indexed depositor, uint256 amount);
    event RevenueClaimed(address indexed holder, uint256 amount);

    constructor(address _revenueToken) ERC20("Pollen", "POLLEN") Ownable(msg.sender) {
        revenueToken = IERC20(_revenueToken);
    }

    // ── Owner Functions ─────────────────────────────────────

    /// @notice Mint POLLEN to a contributor (called per epoch)
    function mint(address to, uint256 amount) external onlyOwner {
        _updateRevenue(to);
        _mint(to, amount);
        if (holdingSince[to] == 0 && amount > 0) {
            holdingSince[to] = block.number;
        }
    }

    /// @notice Batch mint to multiple contributors in one tx
    function mintBatch(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            _updateRevenue(recipients[i]);
            _mint(recipients[i], amounts[i]);
            if (holdingSince[recipients[i]] == 0 && amounts[i] > 0) {
                holdingSince[recipients[i]] = block.number;
            }
        }
    }

    /// @notice Set minimum holding period for revenue claims
    function setMinHoldBlocks(uint256 _blocks) external onlyOwner {
        minHoldBlocks = _blocks;
    }

    // ── Revenue Distribution ────────────────────────────────

    /// @notice Deposit USDC revenue for distribution to holders
    function depositRevenue(uint256 amount) external {
        require(totalSupply() > 0, "no holders");
        revenueToken.transferFrom(msg.sender, address(this), amount);
        accRevenuePerShare += (amount * PRECISION) / totalSupply();
        emit RevenueDeposited(msg.sender, amount);
    }

    /// @notice View pending USDC revenue for an account
    function earned(address account) public view returns (uint256) {
        uint256 pending = pendingRevenue[account];
        if (balanceOf(account) > 0) {
            pending += (balanceOf(account) * accRevenuePerShare) / PRECISION - revenueDebt[account];
        }
        return pending;
    }

    /// @notice Claim accumulated USDC revenue
    function claimRevenue() external {
        require(holdingSince[msg.sender] != 0, "no tokens held");
        if (minHoldBlocks > 0) {
            require(block.number >= holdingSince[msg.sender] + minHoldBlocks, "hold period active");
        }
        _updateRevenue(msg.sender);
        uint256 amount = pendingRevenue[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingRevenue[msg.sender] = 0;
        revenueToken.transfer(msg.sender, amount);
        emit RevenueClaimed(msg.sender, amount);
    }

    // ── Internal ────────────────────────────────────────────

    /// @dev Update revenue accounting before any balance change
    function _updateRevenue(address account) internal {
        if (balanceOf(account) > 0) {
            pendingRevenue[account] +=
                (balanceOf(account) * accRevenuePerShare) / PRECISION - revenueDebt[account];
        }
        // Will be recalculated after balance change in _update
    }

    /// @dev Hook: update revenue debt on every transfer/mint/burn
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0)) _updateRevenue(from);
        if (to != address(0)) _updateRevenue(to);

        super._update(from, to, amount);

        // Update debt to match new balances
        if (from != address(0)) {
            revenueDebt[from] = (balanceOf(from) * accRevenuePerShare) / PRECISION;
            if (balanceOf(from) == 0) holdingSince[from] = 0;
        }
        if (to != address(0)) {
            revenueDebt[to] = (balanceOf(to) * accRevenuePerShare) / PRECISION;
            if (holdingSince[to] == 0 && balanceOf(to) > 0) {
                holdingSince[to] = block.number;
            }
        }
    }
}
