// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {PollenActiveRevenueVault} from "../src/PollenActiveRevenueVault.sol";
import {PollenSettlementV3} from "../src/PollenSettlementV3.sol";

/**
 * @notice Deployment recipe only. Running this script broadcasts transactions
 *         and therefore requires a separate explicit production approval.
 */
contract DeployV3 is Script {
    function run() external returns (PollenActiveRevenueVault vault, PollenSettlementV3 settlement) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address usdc = vm.envAddress("USDC_ADDRESS");
        address pollenTokenV2 = vm.envAddress("POLLEN_TOKEN_V2_ADDRESS");
        address finalAdmin = vm.envAddress("ACTIVE_REVENUE_ADMIN_ADDRESS");
        address publisher = vm.envAddress("ACTIVE_REVENUE_PUBLISHER_ADDRESS");
        address pauser = vm.envAddress("ACTIVE_REVENUE_PAUSER_ADDRESS");

        require(usdc != address(0), "USDC_ADDRESS is zero");
        require(pollenTokenV2 != address(0), "POLLEN_TOKEN_V2_ADDRESS is zero");
        require(finalAdmin != address(0), "ACTIVE_REVENUE_ADMIN_ADDRESS is zero");
        require(publisher != address(0), "ACTIVE_REVENUE_PUBLISHER_ADDRESS is zero");
        require(pauser != address(0), "ACTIVE_REVENUE_PAUSER_ADDRESS is zero");

        vm.startBroadcast(deployerKey);

        // The deployer is temporary admin only so it can bind the settlement
        // address after both immutable contracts exist in the same transaction sequence.
        vault = new PollenActiveRevenueVault(usdc, pollenTokenV2, deployer, publisher, pauser);
        settlement = new PollenSettlementV3(usdc, address(vault));
        vault.grantRole(vault.DEPOSITOR_ROLE(), address(settlement));

        if (finalAdmin != deployer) {
            vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), finalAdmin);
            vault.renounceRole(vault.DEFAULT_ADMIN_ROLE(), deployer);
        }

        vm.stopBroadcast();
    }
}
