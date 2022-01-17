import { task } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import { promises as fs } from 'fs';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';

task('accounts', 'get accounts', async (_, { ethers }) => {
    let deployerAddress: SignerWithAddress;
    let creatorsAddress: SignerWithAddress;
    let daoAddress: SignerWithAddress;
    [deployerAddress, creatorsAddress, daoAddress] = await ethers.getSigners();
    console.log(deployerAddress.address, creatorsAddress.address, daoAddress.address);
});

// testing purposes only
task('create-wallets', 'creates wallets for required testing', async (_, { ethers }) => {
    const creatorsWallet = ethers.Wallet.createRandom()
    const b = {
        name: "creators",
        address: creatorsWallet.address,
        mnemonic: creatorsWallet.mnemonic.phrase,
        privateKey: creatorsWallet.privateKey,
    }

    const daoWallet = ethers.Wallet.createRandom()
    const db = {
        name: "dao",
        address: daoWallet.address,
        mnemonic: daoWallet.mnemonic.phrase,
        privateKey: daoWallet.privateKey,
    }

    await fs.writeFile('./wallets/creators.json', JSON.stringify(b))
    await fs.writeFile('./wallets/dao.json', JSON.stringify(db))
});
