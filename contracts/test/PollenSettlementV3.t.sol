// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PollenTokenV2} from "../src/PollenTokenV2.sol";
import {PollenActiveRevenueVault} from "../src/PollenActiveRevenueVault.sol";
import {PollenSettlementV3} from "../src/PollenSettlementV3.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract PollenSettlementV3Test is Test {
    PollenTokenV2 internal token;
    PollenActiveRevenueVault internal vault;
    PollenSettlementV3 internal settlement;
    MockUSDC internal usdc;

    uint256 internal buyerKey = 0xA11CE;
    address internal buyer;

    function setUp() public {
        buyer = vm.addr(buyerKey);
        usdc = new MockUSDC();
        token = new PollenTokenV2(address(usdc), address(this), address(this), new address[](0), new uint256[](0));
        vault = new PollenActiveRevenueVault(address(usdc), address(token), address(this), address(this), address(this));
        settlement = new PollenSettlementV3(address(usdc), address(vault));
        vault.grantRole(vault.DEPOSITOR_ROLE(), address(settlement));
        usdc.mint(buyer, 1_000e6);
    }

    function _signAuth(uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                buyer,
                address(settlement),
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(buyerKey, digest);
    }

    function test_constructor_maxApprovesVault() public view {
        assertEq(usdc.allowance(address(settlement), address(vault)), type(uint256).max);
    }

    function test_settle_deposits_exact_value_into_active_revenue_vault() public {
        uint256 value = 100e6;
        bytes32 nonce = keccak256("v3-payment");
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, type(uint256).max, nonce);

        vm.prank(makeAddr("facilitator"));
        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);

        assertEq(usdc.balanceOf(buyer), 900e6);
        assertEq(usdc.balanceOf(address(settlement)), 0);
        assertEq(usdc.balanceOf(address(vault)), value);
        assertEq(vault.availableRevenue(), value);
    }

    function test_settle_preserves_eip3009_replay_and_signature_checks() public {
        uint256 value = 5e6;
        bytes32 nonce = keccak256("v3-replay");
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, type(uint256).max, nonce);
        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);

        vm.expectRevert(bytes("authorization used"));
        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);

        bytes32 badNonce = keccak256("v3-bad-signature");
        (v, r, s) = _signAuth(value, 0, type(uint256).max, badNonce);
        vm.expectRevert(bytes("invalid signature"));
        settlement.settle(buyer, value + 1, 0, type(uint256).max, badNonce, v, r, s);
    }
}
