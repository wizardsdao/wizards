/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { HardhatUserConfig } from "hardhat/config";
import dotenv from "dotenv";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@float-capital/solidity-coverage";
import "hardhat-typechain";
import "hardhat-abi-exporter";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "./tasks";

dotenv.config();

const config = {
  solidity: {
    version: "0.8.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10_000,
      },
    },
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_NETWORK_URL,
      accounts: [process.env.CREATOR_WALLET_PRIVATE_KEY, process.env.DAO_WALLET_PRIVATE_KEY].filter(Boolean),
    },
    rinkeby: {
      url: process.env.RINKEBY_NETWORK_URL,
      accounts: [process.env.CREATOR_WALLET_PRIVATE_KEY, process.env.DAO_WALLET_PRIVATE_KEY].filter(Boolean),
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  abiExporter: {
    path: "./artifacts",
    clear: true,
  },
  gasReporter: {
    enabled: !process.env.CI,
    currency: "USD",
    gasPrice: 200, // change to current gas prices when running tests to get accurate costs
    src: "contracts",
    coinmarketcap: "7643dfc7-a58f-46af-8314-2db32bdd18ba",
  },
  mocha: {
    timeout: 500_000,
  },
};

export default config;
