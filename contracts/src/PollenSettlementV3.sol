// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPollenActiveRevenueVault {
    function depositRevenue(uint256 amount) external;
}

interface IUSDCWithAuthorization {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/**
 * @title PollenSettlementV3
 * @notice x402 settlement adapter for the active-holder revenue vault.
 *         Its settle ABI remains compatible with V2, but its destination is
 *         a new vault. V2 remains unchanged until an explicitly approved cutover.
 */
contract PollenSettlementV3 {
    using SafeERC20 for IERC20;

    IUSDCWithAuthorization public immutable usdc;
    IERC20 public immutable usdcErc20;
    IPollenActiveRevenueVault public immutable revenueVault;

    event Settled(address indexed from, uint256 amount);

    constructor(address _usdc, address _revenueVault) {
        require(_usdc != address(0), "usdc is zero");
        require(_revenueVault != address(0), "vault is zero");
        usdc = IUSDCWithAuthorization(_usdc);
        usdcErc20 = IERC20(_usdc);
        revenueVault = IPollenActiveRevenueVault(_revenueVault);
        IERC20(_usdc).forceApprove(_revenueVault, type(uint256).max);
    }

    function settle(
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        usdc.transferWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s);
        revenueVault.depositRevenue(value);
        emit Settled(from, value);
    }
}
