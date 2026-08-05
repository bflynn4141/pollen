// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PollenTokenV2} from "../src/PollenTokenV2.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract PollenTokenV2Test is Test {
    PollenTokenV2 internal token;
    MockUSDC internal usdc;

    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal rando = makeAddr("rando");

    uint256 internal EPOCH_ZERO;

    function setUp() public {
        usdc = new MockUSDC();
        token = new PollenTokenV2(
            address(usdc), address(this), minter, new address[](0), new uint256[](0)
        ); // admin = this test

        EPOCH_ZERO = token.EPOCH_ZERO();
        vm.warp(EPOCH_ZERO); // epoch 1 begins

        // Fund this test as the revenue depositor
        usdc.mint(address(this), 1_000_000_000e6);
        usdc.approve(address(token), type(uint256).max);
    }

    // ── Regression: v1 claimRevenue drain ───────────────────

    /// v1 bug: claimRevenue zeroed pending but never refreshed revenueDebt,
    /// so a second claim re-credited the same accrual and drained the pot.
    function test_drainRegression_secondClaimPaysZeroAndPotIsSafe() public {
        token.mint(alice, 50e18);
        token.mint(bob, 50e18);
        token.depositRevenue(100e6);

        vm.prank(alice);
        token.claimRevenue();
        assertEq(usdc.balanceOf(alice), 50e6, "alice first claim");
        assertEq(token.earned(alice), 0, "alice fully settled");

        // Second claim must pay nothing (reverts with "nothing to claim")
        vm.prank(alice);
        vm.expectRevert(bytes("nothing to claim"));
        token.claimRevenue();

        assertEq(usdc.balanceOf(alice), 50e6, "alice got nothing extra");
        assertEq(usdc.balanceOf(address(token)), 50e6, "bob's share intact");

        // Bob can still claim his full share — pot was not drained
        vm.prank(bob);
        token.claimRevenue();
        assertEq(usdc.balanceOf(bob), 50e6, "bob full share");
        assertEq(usdc.balanceOf(address(token)), 0, "pot exactly emptied");
    }

    // ── Regression: v1 mint double-credit ───────────────────

    /// v1 bug: mint() pre-called _updateRevenue(to), then _update called it
    /// again before the debt refresh — pending was credited twice.
    function test_doubleCreditRegression_mintMidStreamCreditsExactlyOnce() public {
        token.mint(alice, 100e18);
        token.depositRevenue(100e6);
        assertEq(token.earned(alice), 100e6, "accrued before mint");

        // Mint more to alice mid-revenue-stream via the epoch path
        vm.warp(EPOCH_ZERO + 7 days); // epoch 2; epoch 1 just closed
        address[] memory to = new address[](1);
        uint256[] memory amt = new uint256[](1);
        to[0] = alice;
        amt[0] = 100e18;
        vm.prank(minter);
        token.mintBatch(to, amt, 1);

        // v1 would report 200e6 here (double credit). Correct is exactly 100e6.
        assertEq(token.earned(alice), 100e6, "credited exactly once");

        vm.prank(alice);
        token.claimRevenue();
        assertEq(usdc.balanceOf(alice), 100e6, "exact USDC paid");
        assertEq(usdc.balanceOf(address(token)), 0, "no over/under payment");

        // New deposits accrue against the new balance, exactly
        token.depositRevenue(200e6); // supply now 200e18
        assertEq(token.earned(alice), 200e6, "post-mint accrual exact");
        vm.prank(alice);
        token.claimRevenue();
        assertEq(usdc.balanceOf(alice), 300e6, "cumulative exact");
    }

    /// Admin migration mint mid-stream must also credit exactly once.
    function test_doubleCreditRegression_adminMintMidStream() public {
        token.mint(alice, 100e18);
        token.depositRevenue(100e6);
        token.mint(alice, 100e18);
        assertEq(token.earned(alice), 100e6, "credited exactly once");
    }

    // ── Pro-rata accounting with transfers between deposits ─

    function test_proRata_twoHolders_transferBetweenDeposits() public {
        token.mint(alice, 75e18);
        token.mint(bob, 25e18);

        token.depositRevenue(100e6);
        assertEq(token.earned(alice), 75e6);
        assertEq(token.earned(bob), 25e6);

        // Rebalance 75/25 -> 25/75 between deposits
        vm.prank(alice);
        token.transfer(bob, 50e18);
        assertEq(token.earned(alice), 75e6, "transfer must not change accrued");
        assertEq(token.earned(bob), 25e6, "transfer must not change accrued");

        token.depositRevenue(100e6);
        assertEq(token.earned(alice), 75e6 + 25e6, "25% of second deposit");
        assertEq(token.earned(bob), 25e6 + 75e6, "75% of second deposit");

        vm.prank(alice);
        token.claimRevenue();
        vm.prank(bob);
        token.claimRevenue();
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 100e6);
        assertEq(usdc.balanceOf(address(token)), 0, "conserved exactly");
    }

    function test_selfTransfer_noDoubleCredit() public {
        token.mint(alice, 100e18);
        token.depositRevenue(100e6);
        vm.prank(alice);
        token.transfer(alice, 10e18);
        assertEq(token.earned(alice), 100e6, "self-transfer credits nothing");
    }

    function test_newHolderEarnsNothingFromPastDeposits() public {
        token.mint(alice, 100e18);
        token.depositRevenue(100e6);
        token.mint(bob, 100e18); // bob joins after the deposit
        assertEq(token.earned(bob), 0, "no retroactive revenue");
        assertEq(token.earned(alice), 100e6);
    }

    // ── Epochs ──────────────────────────────────────────────

    function test_currentEpoch() public {
        vm.warp(EPOCH_ZERO);
        assertEq(token.currentEpoch(), 1);
        vm.warp(EPOCH_ZERO + 7 days - 1);
        assertEq(token.currentEpoch(), 1);
        vm.warp(EPOCH_ZERO + 7 days);
        assertEq(token.currentEpoch(), 2);
        vm.warp(EPOCH_ZERO + 13 weeks);
        assertEq(token.currentEpoch(), 14);

        vm.warp(EPOCH_ZERO - 1);
        vm.expectRevert(bytes("before epoch zero"));
        token.currentEpoch();
    }

    function test_epochPool_halvesEvery13Epochs() public {
        assertEq(token.epochPool(1), 100_000e18);
        assertEq(token.epochPool(13), 100_000e18);
        assertEq(token.epochPool(14), 50_000e18);
        assertEq(token.epochPool(26), 50_000e18);
        assertEq(token.epochPool(27), 25_000e18);

        vm.expectRevert(bytes("epoch is 1-based"));
        token.epochPool(0);
    }

    function _batch(address to, uint256 amt)
        internal
        pure
        returns (address[] memory recipients, uint256[] memory amounts)
    {
        recipients = new address[](1);
        amounts = new uint256[](1);
        recipients[0] = to;
        amounts[0] = amt;
    }

    function test_mintBatch_paysJustClosedEpoch() public {
        vm.warp(EPOCH_ZERO + 7 days); // epoch 2
        (address[] memory to, uint256[] memory amt) = _batch(alice, 1_000e18);
        vm.prank(minter);
        token.mintBatch(to, amt, 1);
        assertEq(token.balanceOf(alice), 1_000e18);
        assertEq(token.mintedInEpoch(1), 1_000e18);
    }

    function test_mintBatch_wrongEpoch_reverts() public {
        (address[] memory to, uint256[] memory amt) = _batch(alice, 1e18);

        // During epoch 1 there is no closed epoch yet
        vm.warp(EPOCH_ZERO);
        vm.prank(minter);
        vm.expectRevert(bytes("not the just-closed epoch"));
        token.mintBatch(to, amt, 1);

        vm.warp(EPOCH_ZERO + 14 days); // epoch 3; only epoch 2 is payable
        vm.prank(minter);
        vm.expectRevert(bytes("not the just-closed epoch"));
        token.mintBatch(to, amt, 1); // stale epoch

        vm.prank(minter);
        vm.expectRevert(bytes("not the just-closed epoch"));
        token.mintBatch(to, amt, 3); // current (still open) epoch

        vm.prank(minter);
        token.mintBatch(to, amt, 2); // just-closed: OK
    }

    function test_mintBatch_epochCap() public {
        vm.warp(EPOCH_ZERO + 7 days); // epoch 2, paying epoch 1 (pool 100k)

        // Exactly the pool is fine, split across batches
        (address[] memory to1, uint256[] memory amt1) = _batch(alice, 60_000e18);
        vm.prank(minter);
        token.mintBatch(to1, amt1, 1);

        (address[] memory to2, uint256[] memory amt2) = _batch(bob, 40_000e18);
        vm.prank(minter);
        token.mintBatch(to2, amt2, 1);
        assertEq(token.mintedInEpoch(1), 100_000e18);

        // One more wei over the pool reverts
        (address[] memory to3, uint256[] memory amt3) = _batch(alice, 1);
        vm.prank(minter);
        vm.expectRevert(bytes("epoch pool exceeded"));
        token.mintBatch(to3, amt3, 1);
    }

    function test_mintBatch_singleOverCap_reverts() public {
        vm.warp(EPOCH_ZERO + 7 days);
        (address[] memory to, uint256[] memory amt) = _batch(alice, 100_000e18 + 1);
        vm.prank(minter);
        vm.expectRevert(bytes("epoch pool exceeded"));
        token.mintBatch(to, amt, 1);
    }

    function test_mintBatch_capUsesEpochPoolHalving() public {
        vm.warp(EPOCH_ZERO + 14 weeks); // epoch 15; epoch 14 pool = 50k
        (address[] memory to, uint256[] memory amt) = _batch(alice, 50_000e18 + 1);
        vm.prank(minter);
        vm.expectRevert(bytes("epoch pool exceeded"));
        token.mintBatch(to, amt, 14);

        (address[] memory to2, uint256[] memory amt2) = _batch(alice, 50_000e18);
        vm.prank(minter);
        token.mintBatch(to2, amt2, 14);
    }

    function test_mintBatch_lengthMismatch_reverts() public {
        vm.warp(EPOCH_ZERO + 7 days);
        address[] memory to = new address[](2);
        uint256[] memory amt = new uint256[](1);
        to[0] = alice;
        to[1] = bob;
        amt[0] = 1e18;
        vm.prank(minter);
        vm.expectRevert(bytes("length mismatch"));
        token.mintBatch(to, amt, 1);
    }

    // ── Roles ───────────────────────────────────────────────

    function test_mintBatch_withoutMinterRole_reverts() public {
        vm.warp(EPOCH_ZERO + 7 days);
        (address[] memory to, uint256[] memory amt) = _batch(alice, 1e18);
        bytes32 minterRole = token.MINTER_ROLE(); // cache: external call would consume the prank
        vm.prank(rando);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, rando, minterRole)
        );
        token.mintBatch(to, amt, 1);
    }

    function test_migrationMint_withoutAdminRole_reverts() public {
        // minter has MINTER_ROLE but not DEFAULT_ADMIN_ROLE
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE(); // cache: external call would consume the prank
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, minter, adminRole)
        );
        token.mint(alice, 1e18);
    }

    function test_adminCannotMintBatchWithoutMinterRole() public {
        vm.warp(EPOCH_ZERO + 7 days);
        (address[] memory to, uint256[] memory amt) = _batch(alice, 1e18);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(this), minterRole
            )
        );
        token.mintBatch(to, amt, 1);
    }

    // ── Migration cap ───────────────────────────────────────

    function test_constructorAtomicallyConfiguresRolesAndMigrationWithoutPrivilegingDeployer() public {
        address admin = makeAddr("splits-admin");
        address payoutMinter = makeAddr("splits-payout");
        address deployer = makeAddr("temporary-deployer");

        address[] memory migrationRecipients = new address[](2);
        migrationRecipients[0] = alice;
        migrationRecipients[1] = bob;
        uint256[] memory migrationAmounts = new uint256[](2);
        migrationAmounts[0] = 50_000e18;
        migrationAmounts[1] = 5_000e18;

        vm.prank(deployer);
        PollenTokenV2 configured = new PollenTokenV2(
            address(usdc), admin, payoutMinter, migrationRecipients, migrationAmounts
        );

        assertTrue(configured.hasRole(configured.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(configured.hasRole(configured.MINTER_ROLE(), payoutMinter));
        assertFalse(configured.hasRole(configured.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(configured.hasRole(configured.MINTER_ROLE(), deployer));
        assertEq(configured.balanceOf(alice), 50_000e18);
        assertEq(configured.balanceOf(bob), 5_000e18);
        assertEq(configured.migrationMinted(), configured.MIGRATION_CAP());
    }

    function test_migrationCap() public {
        token.mint(alice, 50_000e18);
        token.mint(bob, 5_000e18);
        assertEq(token.migrationMinted(), 55_000e18);
        assertEq(token.migrationMinted(), token.MIGRATION_CAP());

        vm.expectRevert(bytes("migration cap exceeded"));
        token.mint(alice, 1);
    }

    function test_migrationCap_singleOverCap_reverts() public {
        vm.expectRevert(bytes("migration cap exceeded"));
        token.mint(alice, 55_000e18 + 1);
    }

    // ── depositRevenue guards ───────────────────────────────

    function test_depositRevenue_noSupply_reverts() public {
        vm.expectRevert(bytes("no holders"));
        token.depositRevenue(1e6);
    }

    // ── Fuzz ────────────────────────────────────────────────

    /// Pro-rata claims conserve the deposit: never over-pay, dust < 3 units.
    function testFuzz_proRataConservesDeposit(uint96 balA, uint96 balB, uint96 amount) public {
        uint256 a = bound(uint256(balA), 1, 27_000e18);
        uint256 b = bound(uint256(balB), 1, 27_000e18);
        uint256 d = bound(uint256(amount), 1, 1_000_000e6);

        token.mint(alice, a);
        token.mint(bob, b);
        token.depositRevenue(d);

        if (token.earned(alice) > 0) {
            vm.prank(alice);
            token.claimRevenue();
        }
        if (token.earned(bob) > 0) {
            vm.prank(bob);
            token.claimRevenue();
        }

        uint256 paid = usdc.balanceOf(alice) + usdc.balanceOf(bob);
        assertLe(paid, d, "never pays out more than deposited");
        assertGe(paid + 2, d, "rounding dust bounded");
    }

    /// After a full claim there is never anything left to claim.
    function testFuzz_doubleClaimAlwaysSafe(uint96 amount) public {
        uint256 d = bound(uint256(amount), 1, 1_000_000e6);
        token.mint(alice, 100e18);
        token.depositRevenue(d);

        vm.prank(alice);
        token.claimRevenue();
        assertEq(usdc.balanceOf(alice), d, "sole holder gets everything");
        assertEq(token.earned(alice), 0);

        vm.prank(alice);
        vm.expectRevert(bytes("nothing to claim"));
        token.claimRevenue();
    }

    /// mintBatch total accounting holds for arbitrary 3-way splits under the pool.
    function testFuzz_mintBatchRespectsPool(uint96 x, uint96 y, uint96 z) public {
        vm.warp(EPOCH_ZERO + 7 days);
        uint256[] memory amt = new uint256[](3);
        amt[0] = bound(uint256(x), 0, 40_000e18);
        amt[1] = bound(uint256(y), 0, 40_000e18);
        amt[2] = bound(uint256(z), 0, 40_000e18);
        uint256 total = amt[0] + amt[1] + amt[2];

        address[] memory to = new address[](3);
        to[0] = alice;
        to[1] = bob;
        to[2] = rando;

        vm.prank(minter);
        if (total > 100_000e18) {
            vm.expectRevert(bytes("epoch pool exceeded"));
            token.mintBatch(to, amt, 1);
        } else {
            token.mintBatch(to, amt, 1);
            assertEq(token.mintedInEpoch(1), total);
            assertEq(token.totalSupply(), total);
        }
    }
}
