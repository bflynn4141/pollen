// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPollenTokenV2 {
    function depositRevenue(uint256 amount) external;
}

interface IUSDC {
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
 * @title PollenSettlementV2
 * @notice Settles x402 payments and distributes 100% of revenue to POLLEN
 *         holders. Same logic as v1, pointed at PollenTokenV2 (the v1
 *         settlement's token reference is immutable, so it cannot be reused).
 *
 * Flow:
 *   1. Buyer signs EIP-3009 TransferWithAuthorization (off-chain)
 *   2. Anyone calls settle() with the signed auth
 *   3. USDC moves from buyer → this contract
 *   4. This contract deposits all USDC into PollenTokenV2 for holder distribution
 */
contract PollenSettlementV2 {
    IUSDC public immutable usdc;
    IPollenTokenV2 public immutable pollenToken;
    IERC20 public immutable usdcErc20;

    event Settled(address indexed from, uint256 amount);

    constructor(address _usdc, address _pollenToken) {
        require(_usdc != address(0), "usdc is zero");
        require(_pollenToken != address(0), "token is zero");
        usdc = IUSDC(_usdc);
        usdcErc20 = IERC20(_usdc);
        pollenToken = IPollenTokenV2(_pollenToken);

        // Max-approve PollenTokenV2 to pull USDC for depositRevenue
        IERC20(_usdc).approve(_pollenToken, type(uint256).max);
    }

    /**
     * @notice Settle an x402 payment. Anyone can call this.
     * @dev Executes the buyer's signed USDC authorization, then deposits
     *      100% into PollenTokenV2 for distribution to POLLEN holders.
     */
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
        // Execute the buyer's signed USDC transfer → this contract
        usdc.transferWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s);

        // 100% to POLLEN holders
        pollenToken.depositRevenue(value);

        emit Settled(from, value);
    }
}
