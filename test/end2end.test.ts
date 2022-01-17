import chai from 'chai';
import { Wallet } from "ethers";
import { ethers, upgrades } from 'hardhat';
import { BigNumber as EthersBN } from 'ethers';
import { solidity } from 'ethereum-waffle';

import {
  WETH,
  WizardToken,
  AuctionHouse,
  AuctionHouse__factory,
  Descriptor,
  Descriptor__factory,
} from '../typechain';

import {
  deployWizardsToken,
  deployWeth,
  populateDescriptor,
  address,
  encodeParameters,
  advanceBlocks,
  blockTimestamp,
  setNextBlockTimestamp,
} from './utils';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

chai.use(solidity);
const { expect } = chai;

let wizardsToken: WizardToken;
let auctionHouse: AuctionHouse;
let descriptor: Descriptor;
let weth: WETH;
let timelock: Wallet;

let deployer: SignerWithAddress;
let wethDeployer: SignerWithAddress;
let bidderA: SignerWithAddress;
let creatorsDAO: SignerWithAddress;
let daoWallet: Wallet;

// Auction House Config
const TIME_BUFFER = 15 * 60;
const RESERVE_PRICE = EthersBN.from("70000000000000000") // .07 eth;

const MIN_INCREMENT_BID_PERCENTAGE = 5;
const DURATION = 60 * 60 * 24;
const AUCTION_ONE_ONE = true;
const WIZARD_CAP = 1000;

async function deploy() {
  [deployer, bidderA, wethDeployer, creatorsDAO] = await ethers.getSigners();

  timelock = ethers.Wallet.createRandom()
  daoWallet = ethers.Wallet.createRandom()

  // timelock address is the WizardsDAO temporary address

  // Deployed by another account to simulate real network
  weth = await deployWeth(wethDeployer);

  // 1. DEPLOY Wizards token
  wizardsToken = await deployWizardsToken(
    deployer,
    creatorsDAO.address,
    deployer.address, // do not know minter/auction house yet
  );

  // 2a. DEPLOY AuctionHouse
  const auctionHouseFactory = await ethers.getContractFactory('AuctionHouse', deployer);
  const auctionHouseProxy = await upgrades.deployProxy(auctionHouseFactory, [
    wizardsToken.address,
    creatorsDAO.address,
    daoWallet.address,
    weth.address,
    TIME_BUFFER,
    RESERVE_PRICE,
    MIN_INCREMENT_BID_PERCENTAGE,
    DURATION,
    AUCTION_ONE_ONE,
    WIZARD_CAP,
  ]);

  // 2b. Connect to auction house through the proxy
  auctionHouse = AuctionHouse__factory.connect(auctionHouseProxy.address, deployer);

  // 3. SET MINTER
  await wizardsToken.setMinter(auctionHouse.address);

  // 4. POPULATE body parts
  descriptor = Descriptor__factory.connect(await wizardsToken.descriptor(), deployer);

  await populateDescriptor(descriptor);

  await wizardsToken.transferOwnership(timelock.address);
    
  await descriptor.transferOwnership(timelock.address);

  // 5. UNPAUSE auction and kick off first mint
  await auctionHouse.unpause();

  await auctionHouse.transferOwnership(timelock.address);
}

describe('End to End test with deployment, auction, proposing, voting, executing', async () => {
  before(deploy);

  it('sets all starting params correctly', async () => {
    expect(await wizardsToken.owner()).to.equal(timelock.address);
    expect(await descriptor.owner()).to.equal(timelock.address);
    expect(await auctionHouse.owner()).to.equal(timelock.address);

    expect(await wizardsToken.minter()).to.equal(auctionHouse.address);
    expect(await wizardsToken.creatorsDAO()).to.equal(creatorsDAO.address);

    expect(await wizardsToken.totalSupply()).to.equal(EthersBN.from('6'));

    expect(await wizardsToken.ownerOf(0)).to.equal(creatorsDAO.address);
    expect(await wizardsToken.ownerOf(1)).to.equal(auctionHouse.address);

    expect((await auctionHouse.auctions(1)).wizardId).to.equal(EthersBN.from('1'));
  });

  it('allows bidding, settling, and transferring ETH correctly', async () => {
    await auctionHouse.connect(bidderA).createBid(1, 1, { value: RESERVE_PRICE });
    await setNextBlockTimestamp(Number(await blockTimestamp('latest')) + DURATION);
    await auctionHouse.settleCurrentAndCreateNewAuction();

    expect(await wizardsToken.ownerOf(1)).to.equal(bidderA.address);

    // ensure dao wallet gets 90% of proceeds
    const royalty = RESERVE_PRICE.mul(10).div(100);
    expect(await ethers.provider.getBalance(daoWallet.address)).to.equal(RESERVE_PRICE.sub(royalty));
  });
});
