import "@nomiclabs/hardhat-ethers";
import { task, types } from "hardhat/config";
import { promises as fs } from 'fs';
import promptjs from 'prompt';

// RH: 
task("whitelist", "Load whitelist addresses into auction house. Should be run day before WL day.")
  .addParam('ahaddress', 'Address of the auction house proxy', undefined, types.string)
  .addOptionalParam("file", "JSON file with addresses", "./files/whitelist.json", types.string)
  .setAction(async (taskArgs, { ethers }) => {
    const f = await fs.readFile(taskArgs.file)
    const whitelist = JSON.parse(f.toString());

    // Don't do anything if there aren't any whitelist addrs 
    if (whitelist.length == 0) return;

    // Use resolver to map whitelist to wallet addrs
    let walletAddrs = await Promise.all(
      whitelist.map(async (addr) => {          
        if (ethers.utils.isAddress(addr)) {
            return addr
        }

        return ethers.provider.resolveName(addr);
      })
    );

    walletAddrs = walletAddrs.filter(f=>f)

    console.log(walletAddrs)

    const auctionHouseFactory = await ethers.getContractFactory('AuctionHouse');
    const auctionHouse = auctionHouseFactory.attach(taskArgs.ahaddress);

    promptjs.start();

    const gasPrice = await ethers.provider.getGasPrice();
    const deploymentGas = await auctionHouse.estimateGas.setWhitelistAddresses(walletAddrs);
    const deploymentCost = deploymentGas.mul(gasPrice);

    console.log(
        `Estimated cost to set whitelist: ${ethers.utils.formatUnits(
            deploymentCost,
            'ether',
        )} ETH`,
    );
      
    const result = await promptjs.get([
        {
            properties: {
            confirm: {
                type: 'string',
                description: 'Type "Y/y" to confirm:',
            },
            },
        },
    ]);      

    if (result.confirm.toString().toLowerCase() != 'y') {
        console.log('Exiting');
        return;
      }

    await auctionHouse.setWhitelistAddresses(walletAddrs);
  }); 