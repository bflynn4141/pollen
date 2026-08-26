// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PollenTokenV2} from "../src/PollenTokenV2.sol";
import {PollenActiveRevenueVault} from "../src/PollenActiveRevenueVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract PollenActiveRevenueVaultTest is Test {
    PollenTokenV2 internal token;
    PollenActiveRevenueVault internal vault;
    MockUSDC internal usdc;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant EPOCH = 1;
    uint256 internal constant SNAPSHOT_BLOCK = 123_456;
    uint256 internal constant CLAIM_WINDOW = 90 days;

    function setUp() public {
        usdc = new MockUSDC();
        token = new PollenTokenV2(address(usdc), address(this), address(this), new address[](0), new uint256[](0));
        vault = new PollenActiveRevenueVault(address(usdc), address(token), address(this), address(this), address(this));
        vault.grantRole(vault.DEPOSITOR_ROLE(), address(this));

        vm.warp(token.EPOCH_ZERO() + token.EPOCH_LENGTH());
        vm.roll(SNAPSHOT_BLOCK + 1);
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(vault), type(uint256).max);
        vault.depositRevenue(1_000e6);
    }

    function _leaf(uint256 epoch, uint256 index, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(epoch, index, account, amount))));
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(bytes.concat(a, b)) : keccak256(bytes.concat(b, a));
    }

    function _publish(bytes32 root, uint256 amount) internal returns (uint256 deadline) {
        deadline = block.timestamp + CLAIM_WINDOW;
        vault.publishDistribution(EPOCH, root, amount, SNAPSHOT_BLOCK, deadline);
    }

    function test_deposit_and_publish_reserve_revenue() public {
        bytes32 root = _leaf(EPOCH, 0, alice, 100e6);
        uint256 deadline = _publish(root, 100e6);

        (
            bytes32 storedRoot,
            uint256 amount,
            uint256 claimed,
            uint256 snapshotBlock,
            uint256 claimDeadline,
            bool expired
        ) = vault.distributions(EPOCH);
        assertEq(storedRoot, root);
        assertEq(amount, 100e6);
        assertEq(claimed, 0);
        assertEq(snapshotBlock, SNAPSHOT_BLOCK);
        assertEq(claimDeadline, deadline);
        assertFalse(expired);
        assertEq(vault.reservedRevenue(), 100e6);
        assertEq(vault.availableRevenue(), 900e6);
    }

    function test_only_authorized_roles_can_deposit_publish_or_pause() public {
        vm.startPrank(attacker);
        vm.expectRevert();
        vault.depositRevenue(1);
        vm.expectRevert();
        vault.publishDistribution(EPOCH, bytes32(uint256(1)), 1, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);
        vm.expectRevert();
        vault.pause();
        vm.stopPrank();
    }

    function test_publish_rejects_open_epoch_invalid_metadata_duplicate_and_overreserve() public {
        bytes32 root = bytes32(uint256(1));

        vm.expectRevert(bytes("epoch is not closed"));
        vault.publishDistribution(2, root, 1, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);
        vm.expectRevert(bytes("root is zero"));
        vault.publishDistribution(EPOCH, bytes32(0), 1, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);
        vm.expectRevert(bytes("amount is zero"));
        vault.publishDistribution(EPOCH, root, 0, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);
        vm.expectRevert(bytes("snapshot block is zero"));
        vault.publishDistribution(EPOCH, root, 1, 0, block.timestamp + CLAIM_WINDOW);
        vm.expectRevert(bytes("claim window too short"));
        vault.publishDistribution(EPOCH, root, 1, SNAPSHOT_BLOCK, block.timestamp + 29 days);
        vm.expectRevert(bytes("insufficient unreserved revenue"));
        vault.publishDistribution(EPOCH, root, 1_000e6 + 1, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);

        _publish(root, 1);
        vm.expectRevert(bytes("distribution exists"));
        vault.publishDistribution(EPOCH, root, 1, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);
    }

    function test_valid_merkle_claim_can_be_relayed_but_always_pays_account() public {
        uint256 aliceAmount = 60e6;
        uint256 bobAmount = 40e6;
        bytes32 aliceLeaf = _leaf(EPOCH, 0, alice, aliceAmount);
        bytes32 bobLeaf = _leaf(EPOCH, 1, bob, bobAmount);
        _publish(_pair(aliceLeaf, bobLeaf), aliceAmount + bobAmount);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = bobLeaf;
        vm.prank(attacker);
        vault.claim(EPOCH, 0, alice, aliceAmount, proof);

        assertEq(usdc.balanceOf(alice), aliceAmount);
        assertEq(usdc.balanceOf(attacker), 0);
        assertTrue(vault.isClaimed(EPOCH, 0));
        assertEq(vault.reservedRevenue(), bobAmount);
    }

    function test_claim_rejects_tampering_and_replay() public {
        uint256 amount = 100e6;
        _publish(_leaf(EPOCH, 0, alice, amount), amount);
        bytes32[] memory proof = new bytes32[](0);

        vm.expectRevert(bytes("invalid proof"));
        vault.claim(EPOCH, 0, bob, amount, proof);
        vault.claim(EPOCH, 0, alice, amount, proof);
        vm.expectRevert(bytes("already claimed"));
        vault.claim(EPOCH, 0, alice, amount, proof);
    }

    function test_claims_conserve_exact_distribution_amount() public {
        uint256 aliceAmount = 60e6;
        uint256 bobAmount = 40e6;
        bytes32 aliceLeaf = _leaf(EPOCH, 0, alice, aliceAmount);
        bytes32 bobLeaf = _leaf(EPOCH, 1, bob, bobAmount);
        _publish(_pair(aliceLeaf, bobLeaf), aliceAmount + bobAmount);

        bytes32[] memory aliceProof = new bytes32[](1);
        aliceProof[0] = bobLeaf;
        bytes32[] memory bobProof = new bytes32[](1);
        bobProof[0] = aliceLeaf;
        vault.claim(EPOCH, 0, alice, aliceAmount, aliceProof);
        vault.claim(EPOCH, 1, bob, bobAmount, bobProof);

        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob), 100e6);
        assertEq(vault.reservedRevenue(), 0);
        assertEq(vault.availableRevenue(), 900e6);
    }

    function test_typescript_merkle_vector_matches_solidity_claim() public {
        address vectorAlice = 0x1111111111111111111111111111111111111111;
        bytes32 typescriptRoot = 0x57aa9833b742e4cad3edbfa02c570f632661ccd45356c4181e093bbb078a8815;
        bytes32[] memory typescriptProof = new bytes32[](1);
        typescriptProof[0] = 0x27a93f03dd21da9534e54c89e13c8e35ee400cbe8c442238df1d818346c98aa1;
        _publish(typescriptRoot, 100e6);

        vault.claim(EPOCH, 0, vectorAlice, 60e6, typescriptProof);
        assertEq(usdc.balanceOf(vectorAlice), 60e6);
    }

    function test_expiry_releases_unclaimed_revenue_as_carry() public {
        uint256 amount = 100e6;
        uint256 deadline = _publish(_leaf(EPOCH, 0, alice, amount), amount);
        vm.warp(deadline + 1);

        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert(bytes("claim period ended"));
        vault.claim(EPOCH, 0, alice, amount, proof);
        vault.expireDistribution(EPOCH);

        assertEq(vault.reservedRevenue(), 0);
        assertEq(vault.availableRevenue(), 1_000e6);
        vm.expectRevert(bytes("distribution expired"));
        vault.expireDistribution(EPOCH);
    }

    function test_pause_blocks_mutating_revenue_paths() public {
        vault.pause();
        vm.expectRevert();
        vault.depositRevenue(1);
        vm.expectRevert();
        vault.publishDistribution(EPOCH, bytes32(uint256(1)), 1, SNAPSHOT_BLOCK, block.timestamp + CLAIM_WINDOW);

        vault.unpause();
        _publish(_leaf(EPOCH, 0, alice, 1), 1);
        vault.pause();
        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert();
        vault.claim(EPOCH, 0, alice, 1, proof);
    }
}
