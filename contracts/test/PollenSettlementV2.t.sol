// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PollenTokenV2} from "../src/PollenTokenV2.sol";
import {PollenSettlementV2} from "../src/PollenSettlementV2.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract PollenSettlementV2Test is Test {
    PollenTokenV2 internal token;
    PollenSettlementV2 internal settlement;
    MockUSDC internal usdc;

    uint256 internal buyerKey = 0xA11CE;
    address internal buyer;
    address internal holder = makeAddr("holder");
    address internal holder2 = makeAddr("holder2");

    function setUp() public {
        buyer = vm.addr(buyerKey);

        usdc = new MockUSDC();
        token = new PollenTokenV2(address(usdc), address(this));
        settlement = new PollenSettlementV2(address(usdc), address(token));

        vm.warp(token.EPOCH_ZERO());

        // Holders must exist before revenue can be deposited
        token.mint(holder, 80e18);
        token.mint(holder2, 20e18);

        usdc.mint(buyer, 1_000_000e6);
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

    function test_constructor_maxApprovesToken() public view {
        assertEq(usdc.allowance(address(settlement), address(token)), type(uint256).max);
    }

    // ── E2E: signed x402 auth → settle → holders claim ──────

    function test_settle_e2e_revenueReachesHolders() public {
        uint256 value = 100e6;
        bytes32 nonce = keccak256("payment-1");
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, type(uint256).max, nonce);

        // Anyone can submit the settlement
        vm.prank(makeAddr("facilitator"));
        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);

        // USDC: buyer → settlement → token (100% to holders)
        assertEq(usdc.balanceOf(buyer), 1_000_000e6 - value);
        assertEq(usdc.balanceOf(address(settlement)), 0, "settlement keeps nothing");
        assertEq(usdc.balanceOf(address(token)), value, "full value deposited");

        // Pro-rata accrual (80/20)
        assertEq(token.earned(holder), 80e6);
        assertEq(token.earned(holder2), 20e6);

        vm.prank(holder);
        token.claimRevenue();
        vm.prank(holder2);
        token.claimRevenue();
        assertEq(usdc.balanceOf(holder), 80e6);
        assertEq(usdc.balanceOf(holder2), 20e6);
        assertEq(usdc.balanceOf(address(token)), 0, "conserved exactly");
    }

    function test_settle_replay_reverts() public {
        uint256 value = 5e6;
        bytes32 nonce = keccak256("payment-replay");
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, type(uint256).max, nonce);

        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);

        vm.expectRevert(bytes("authorization used"));
        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);
    }

    function test_settle_badSignature_reverts() public {
        uint256 value = 5e6;
        bytes32 nonce = keccak256("payment-bad-sig");
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, type(uint256).max, nonce);

        // Tampered value does not match the signed payload
        vm.expectRevert(bytes("invalid signature"));
        settlement.settle(buyer, value + 1, 0, type(uint256).max, nonce, v, r, s);
    }

    function test_settle_expiredAuthorization_reverts() public {
        uint256 value = 5e6;
        bytes32 nonce = keccak256("payment-expired");
        uint256 validBefore = block.timestamp; // requires block.timestamp < validBefore
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, validBefore, nonce);

        vm.expectRevert(bytes("authorization expired"));
        settlement.settle(buyer, value, 0, validBefore, nonce, v, r, s);
    }

    function test_settle_notYetValid_reverts() public {
        uint256 value = 5e6;
        bytes32 nonce = keccak256("payment-early");
        uint256 validAfter = block.timestamp; // requires block.timestamp > validAfter
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, validAfter, type(uint256).max, nonce);

        vm.expectRevert(bytes("authorization not yet valid"));
        settlement.settle(buyer, value, validAfter, type(uint256).max, nonce, v, r, s);
    }

    // ── Fuzz ────────────────────────────────────────────────

    function testFuzz_settle_depositsExactValue(uint96 rawValue) public {
        uint256 value = bound(uint256(rawValue), 1, 1_000_000e6);
        bytes32 nonce = keccak256(abi.encode("fuzz", rawValue));
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(value, 0, type(uint256).max, nonce);

        uint256 accBefore = token.accRevenuePerShare();
        settlement.settle(buyer, value, 0, type(uint256).max, nonce, v, r, s);

        assertEq(usdc.balanceOf(address(token)), value);
        assertEq(usdc.balanceOf(address(settlement)), 0);
        assertEq(token.accRevenuePerShare() - accBefore, (value * 1e30) / token.totalSupply());
    }
}
