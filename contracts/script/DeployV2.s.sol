// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {PollenTokenV2} from "../src/PollenTokenV2.sol";
import {PollenSettlementV2} from "../src/PollenSettlementV2.sol";

/**
 * Deploy PollenTokenV2 + PollenSettlementV2 and perform the v1 supply
 * migration + MINTER_ROLE grant in one broadcast.
 *
 * Required env:
 *   DEPLOYER_KEY      private key that broadcasts (MUST be ADMIN_ADDRESS —
 *                     migration mint + grantRole are DEFAULT_ADMIN_ROLE calls)
 *   ADMIN_ADDRESS     receives DEFAULT_ADMIN_ROLE
 *   MINTER_ADDRESS    receives MINTER_ROLE (the AgentKit payout wallet)
 *
 * Optional env:
 *   USDC_ADDRESS      revenue token (default: Base mainnet USDC)
 *   MIGRATE_TO_1 / MIGRATE_AMOUNT_1   first migration mint (skip if unset)
 *   MIGRATE_TO_2 / MIGRATE_AMOUNT_2   second migration mint (skip if unset)
 *
 * Usage (Base mainnet):
 *   DEPLOYER_KEY=0x... ADMIN_ADDRESS=0x... MINTER_ADDRESS=0x... \
 *   MIGRATE_TO_1=0x9C87d52543A57B1a02eeD0497D43bDb87D0B175c MIGRATE_AMOUNT_1=50000000000000000000000 \
 *   MIGRATE_TO_2=0x284A5164DdCBD9efA82c3dA87b8C2eae72e8e9dD MIGRATE_AMOUNT_2=5000000000000000000000 \
 *   forge script script/DeployV2.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract DeployV2 is Script {
    // USDC on Base mainnet
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(deployerKey);

        address admin = vm.envAddress("ADMIN_ADDRESS");
        address minter = vm.envAddress("MINTER_ADDRESS");
        address usdc = vm.envOr("USDC_ADDRESS", BASE_USDC);

        address migrateTo1 = vm.envOr("MIGRATE_TO_1", address(0));
        uint256 migrateAmount1 = vm.envOr("MIGRATE_AMOUNT_1", uint256(0));
        address migrateTo2 = vm.envOr("MIGRATE_TO_2", address(0));
        uint256 migrateAmount2 = vm.envOr("MIGRATE_AMOUNT_2", uint256(0));

        // Migration mint + grantRole require DEFAULT_ADMIN_ROLE, which the
        // constructor grants to ADMIN_ADDRESS — so the broadcaster must be it.
        require(deployer == admin, "DEPLOYER_KEY must be ADMIN_ADDRESS (admin-only calls in this script)");
        require(minter != address(0), "MINTER_ADDRESS is zero");

        vm.startBroadcast(deployerKey);

        PollenTokenV2 token = new PollenTokenV2(usdc, admin);
        PollenSettlementV2 settlement = new PollenSettlementV2(usdc, address(token));

        // One-time v1 supply migration (capped on-chain at MIGRATION_CAP = 55k)
        if (migrateTo1 != address(0) && migrateAmount1 > 0) {
            token.mint(migrateTo1, migrateAmount1);
        }
        if (migrateTo2 != address(0) && migrateAmount2 > 0) {
            token.mint(migrateTo2, migrateAmount2);
        }

        // Weekly epoch payouts come from the AgentKit wallet
        token.grantRole(token.MINTER_ROLE(), minter);

        vm.stopBroadcast();

        console.log("PollenTokenV2 deployed at:", address(token));
        console.log("PollenSettlementV2 deployed at:", address(settlement));
        console.log("USDC (revenue token):", usdc);
        console.log("Admin (DEFAULT_ADMIN_ROLE):", admin);
        console.log("Minter (MINTER_ROLE):", minter);
        if (migrateTo1 != address(0) && migrateAmount1 > 0) {
            console.log("Migrated to:", migrateTo1, "amount:", migrateAmount1);
        }
        if (migrateTo2 != address(0) && migrateAmount2 > 0) {
            console.log("Migrated to:", migrateTo2, "amount:", migrateAmount2);
        }
        console.log("Migration minted total:", token.migrationMinted());
    }
}
