// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PollenTokenV2} from "../src/PollenTokenV2.sol";
import {PollenActiveRevenueVault} from "../src/PollenActiveRevenueVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract ActiveRevenueVaultHandler is Test {
    PollenActiveRevenueVault internal immutable vault;
    MockUSDC internal immutable usdc;
    address internal immutable alice;
    address internal immutable bob;
    uint256 internal immutable deadline;

    uint256 public totalDeposited;

    constructor(
        PollenActiveRevenueVault _vault,
        MockUSDC _usdc,
        address _alice,
        address _bob,
        uint256 _deadline,
        uint256 initialDeposit
    ) {
        vault = _vault;
        usdc = _usdc;
        alice = _alice;
        bob = _bob;
        deadline = _deadline;
        totalDeposited = initialDeposit;
        usdc.approve(address(vault), type(uint256).max);
    }

    function deposit(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000e6);
        usdc.mint(address(this), amount);
        vault.depositRevenue(amount);
        totalDeposited += amount;
    }

    function claimAlice() external {
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = 0x27a93f03dd21da9534e54c89e13c8e35ee400cbe8c442238df1d818346c98aa1;
        try vault.claim(1, 0, alice, 60e6, proof) {} catch {}
    }

    function claimBob() external {
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = 0x19aad3e4ee326a0105b5743b7698dc4efe94442ee8b95c957f1636c0085cc832;
        try vault.claim(1, 1, bob, 40e6, proof) {} catch {}
    }

    function expire() external {
        vm.warp(deadline + 1);
        try vault.expireDistribution(1) {} catch {}
    }
}

contract PollenActiveRevenueVaultInvariantTest is StdInvariant, Test {
    PollenActiveRevenueVault internal vault;
    MockUSDC internal usdc;
    ActiveRevenueVaultHandler internal handler;
    address internal alice = 0x1111111111111111111111111111111111111111;
    address internal bob = 0x2222222222222222222222222222222222222222;

    function setUp() public {
        usdc = new MockUSDC();
        PollenTokenV2 token =
            new PollenTokenV2(address(usdc), address(this), address(this), new address[](0), new uint256[](0));
        vault = new PollenActiveRevenueVault(address(usdc), address(token), address(this), address(this), address(this));
        vm.warp(token.EPOCH_ZERO() + token.EPOCH_LENGTH());
        vm.roll(123_457);

        uint256 initialDeposit = 100e6;
        uint256 deadline = block.timestamp + 90 days;
        handler = new ActiveRevenueVaultHandler(vault, usdc, alice, bob, deadline, initialDeposit);
        vault.grantRole(vault.DEPOSITOR_ROLE(), address(handler));
        usdc.mint(address(handler), initialDeposit);
        vm.prank(address(handler));
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(address(handler));
        vault.depositRevenue(initialDeposit);
        vault.publishDistribution(
            1, 0x57aa9833b742e4cad3edbfa02c570f632661ccd45356c4181e093bbb078a8815, initialDeposit, 123_456, deadline
        );
        targetContract(address(handler));
    }

    function invariant_reserved_revenue_never_exceeds_vault_balance() public view {
        assertLe(vault.reservedRevenue(), usdc.balanceOf(address(vault)));
    }

    function invariant_available_and_reserved_partition_vault_balance() public view {
        assertEq(vault.availableRevenue() + vault.reservedRevenue(), usdc.balanceOf(address(vault)));
    }

    function invariant_all_deposited_revenue_remains_in_vault_or_proved_wallets() public view {
        assertEq(usdc.balanceOf(address(vault)) + usdc.balanceOf(alice) + usdc.balanceOf(bob), handler.totalDeposited());
    }
}
