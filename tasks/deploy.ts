import "@nomiclabs/hardhat-ethers";
import { promises as fs } from 'fs';
import { default as AuctionHouseABI } from '../artifacts/contracts/internal/auctionhouse/AuctionHouse.sol/AuctionHouse.json';
import { Interface } from 'ethers/lib/utils';
import { task, types } from 'hardhat/config';
import { BigNumber, Wallet } from "ethers";
import promptjs from 'prompt';

promptjs.colors = false;
promptjs.message = '> ';
promptjs.delimiter = '';

type ContractName =
  | 'NFTDescriptor'
  | 'Descriptor'
  | 'Seeder'
  | 'WizardToken'
  | 'AuctionHouse'
  | 'AuctionHouseProxyAdmin'
  | 'AuctionHouseProxy';

interface Contract {
  args?: (string | number | (() => string | undefined))[];
  address?: string;
  libraries?: () => Record<string, string>;
  waitForConfirmation?: boolean;
}

type Deployed = {
  address: string;
  name: string;
}

const reservePrice = BigNumber.from("70000000000000000") // .07 eth;
task('deploy', 'Deploys NFTDescriptor, Descriptor, Seeder, and WizardToken')
  .addOptionalParam('auctionTimeBuffer', 'The auction time buffer (seconds)', 5 * 60, types.int)
  .addOptionalParam('auctionReservePrice', 'The auction reserve price (wei)', (.07 * (10 ** 18)), types.int) // .07 eth
  .addOptionalParam(
    'auctionMinIncrementBidPercentage',
    'The auction min increment bid percentage (out of 100)',
    5,
    types.int,
  )
  .addOptionalParam('auctionDuration', 'The auction duration (seconds)', 60 * 60 * 24, types.int) // Default: 24 hours
  .addOptionalParam('auctionOneOfOne', 'Wether we should include 1/1 pieces in auction', false, types.boolean) // Default: true
  .addOptionalParam('wizardCap', 'Total supply of wizards to auction. last wizId will be this cap - 1', 2000, types.int)
  .addOptionalParam('timelockDelay', 'The timelock delay (seconds)', 60 * 60 * 24 * 2, types.int) // Default: 2 days
  .addOptionalParam('votingPeriod', 'The voting period (blocks)', 4 * 60 * 24 * 3, types.int) // Default: 3 days
  .addOptionalParam('votingDelay', 'The voting delay (blocks)', 1, types.int) // Default: 1 block
  .addOptionalParam('proposalThresholdBps', 'The proposal threshold (basis points)', 500, types.int) // Default: 5%
  .addOptionalParam('quorumVotesBps', 'Votes required for quorum (basis points)', 1_000, types.int) // Default: 10%
  .addOptionalParam('creatorsaddress', 'Creators wallet address', '', types.string)
  .addOptionalParam('daoaddress', 'DAO gnosis safe', '', types.string)
  .setAction(async (args, { ethers }) => {
    const network = await ethers.provider.getNetwork();

    // opensea proxy address
    const proxyRegistryAddress =
      network.chainId === 1
        ? '0xa5409ec958c83c3f309868babaca7c86dcb077c1'
        : '0xf57b2c51ded3a29e6891aba85459d600256cf317';

    // 1 is mainnet else rinkeby
    const wethAddress = network.chainId === 1 ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '0xc778417e063141139fce010982780140aa0cd5ab'
    console.log(`chain ${network.chainId} configured weth address: ${wethAddress}`)

    // how contract addresses are computed
    // https://ethereum.stackexchange.com/a/761
    const AUCTION_HOUSE_PROXY_NONCE_OFFSET = 6;

    const [creatorsAddress, daoAddress] = await ethers.getSigners();
    const nonce = await creatorsAddress.getTransactionCount();
    const expectedAuctionHouseProxyAddress = ethers.utils.getContractAddress({
      from: creatorsAddress.address,
      nonce: nonce + AUCTION_HOUSE_PROXY_NONCE_OFFSET,
    });

    const contracts: Record<ContractName, Contract> = {
      NFTDescriptor: {},
      Descriptor: {
        libraries: () => ({
          NFTDescriptor: contracts['NFTDescriptor'].address as string,
        }),
      },
      Seeder: {},
      WizardToken: {
        args: [
          args.creatorsaddress || creatorsAddress.address, // address to mint wizard rewards to
          expectedAuctionHouseProxyAddress, // only the auctionhouse can mint
          () => contracts['Descriptor'].address,
          () => contracts['Seeder'].address,
          proxyRegistryAddress, // opensea registry
          args.wizardCap,
        ],
      },
      AuctionHouse: {
        waitForConfirmation: true,
      },
      AuctionHouseProxyAdmin: {},
      AuctionHouseProxy: {
        args: [
          () => contracts['AuctionHouse'].address,
          () => contracts['AuctionHouseProxyAdmin'].address,
          () =>
            new Interface(AuctionHouseABI.abi).encodeFunctionData('initialize', [
              contracts['WizardToken'].address,
              args.creatorsaddress || creatorsAddress.address, // address to take 10% startup fee from
              args.daoaddress || daoAddress.address, // address to store 90% dao proceeds
              wethAddress,
              args.auctionTimeBuffer,
              reservePrice,
              args.auctionMinIncrementBidPercentage,
              args.auctionDuration,
              args.auctionOneOfOne,
              args.wizardCap,
              5 // auction count
            ]),
        ],
      },
    };

    let gasPrice = await ethers.provider.getGasPrice();
    let gasInGwei = Math.round(Number(ethers.utils.formatUnits(gasPrice, 'gwei')));

    promptjs.start();

    const ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            deployer address: ${creatorsAddress.address} (owner of contracts)
            creators address: ${args.creatorsaddress || creatorsAddress.address} (receives 10% proceeds)
            dao address: ${args.daoaddress || daoAddress.address} (to receive 90% auction proceeds)
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    let result = await promptjs.get([
      {
        properties: {
          gasPrice: {
            type: 'integer',
            required: true,
            description: 'Enter a gas price (gwei)',
            default: gasInGwei,
          },
        },
      },
    ]);

    gasPrice = ethers.utils.parseUnits(result.gasPrice.toString(), 'gwei');

    const deployed: Deployed[] = [];
    for (const [name, contract] of Object.entries(contracts)) {
      result = await promptjs.get([
        {
          properties: {
            confirm: {
              type: 'string',
              description: 'Type "SKIP" to skip:',
            },
          },
        },
      ]);

      if (result.confirm == 'SKIP') {
        console.log('SKIPPED', name)
        continue
      }

      const factory = await ethers.getContractFactory(name, {
        libraries: contract?.libraries?.(),
      });

      gasPrice = await ethers.provider.getGasPrice();
      gasInGwei = Math.round(Number(ethers.utils.formatUnits(gasPrice, 'gwei')));
      console.log('estimated gasPrice', gasInGwei)
      
      const deploymentGas = await factory.signer.estimateGas(
        factory.getDeployTransaction(
          ...(contract.args?.map(a => (typeof a === 'function' ? a() : a)) ?? []),
        ),
      );
      const deploymentCost = deploymentGas.mul(gasPrice);

      console.log(
        `Estimated cost to deploy ${name}: ${ethers.utils.formatUnits(
          deploymentCost,
          'ether',
        )} ETH`,
      );
      
      result = await promptjs.get([
        {
          properties: {
            confirm: {
              type: 'string',
              description: 'Type "DEPLOY" to confirm:',
            },
          },
        },
      ]);      

      if (result.confirm != 'DEPLOY') {
        console.log('Exiting');
        return;
      }

      gasPrice = await ethers.provider.getGasPrice();
      gasInGwei = Math.round(Number(ethers.utils.formatUnits(gasPrice, 'gwei')));
      console.log('Deploying...', gasInGwei);

      const deployedContract = await factory.deploy(
        ...(contract.args?.map(a => (typeof a === 'function' ? a() : a)) ?? []),
      );

      if (contract.waitForConfirmation) {
        await deployedContract.deployed();
      }

      contracts[name as ContractName].address = deployedContract.address;
      deployed.push({ name: name, address: deployedContract.address })

      console.log(`${name} contract deployed to ${deployedContract.address}`);
    }

    await fs.writeFile('./deployed.json', JSON.stringify(deployed))
    return contracts
  });
