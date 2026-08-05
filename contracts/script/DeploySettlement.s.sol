// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PollenSettlement.sol";

/**
 * Deploy PollenSettlement to Base mainnet.
 *
 * Usage:
 *   DEPLOYER_KEY=0x... forge script script/DeploySettlement.s.sol \
 *     --rpc-url https://mainnet.base.org --broadcast
 */
contract DeploySettlement is Script {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant POLLEN_TOKEN = 0xFa8B0e3DcC0788d4a6b5fEEFBe9FF03f596DD2ED;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");

        vm.startBroadcast(deployerKey);

        PollenSettlement settlement = new PollenSettlement(USDC, POLLEN_TOKEN);

        vm.stopBroadcast();

        console.log("PollenSettlement deployed at:", address(settlement));
        console.log("USDC:", USDC);
        console.log("PollenToken:", POLLEN_TOKEN);
    }
}
