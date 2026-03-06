// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PollenToken.sol";

/**
 * Deploy PollenToken to Base mainnet and mint initial allocation.
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 */
contract DeployPollen is Script {
    // USDC on Base mainnet
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Initial recipients and amounts (18 decimals)
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // Deploy token
        PollenToken token = new PollenToken(USDC);

        // Mint initial allocation — early contributors
        // Brian (primary contributor)
        token.mint(0x9C87d52543A57B1a02eeD0497D43bDb87D0B175c, 50_000e18);

        // Demo wallet (for live demo)
        token.mint(0x284A5164DdCBD9efA82c3dA87b8C2eae72e8e9dD, 5_000e18);

        vm.stopBroadcast();

        console.log("PollenToken deployed at:", address(token));
        console.log("Owner:", deployer);
        console.log("Minted 50,000 POLLEN to Brian");
        console.log("Minted 5,000 POLLEN to demo wallet");
    }
}
