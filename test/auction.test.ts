import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers, upgrades } from 'hardhat';
import { Wallet, BigNumber } from "ethers";
import {
  MaliciousBidder__factory,
  AuctionHouse,
  Descriptor__factory,
  WizardToken,
  WETH,
} from '../typechain';
import { deployWizardsToken, deployWeth, populateDescriptor, deployWizardsSeeder } from './utils';

chai.use(solidity);
const { expect } = chai;

describe('AuctionHouse', () => {
  let wizardsAuctionHouse: AuctionHouse;
  let wizardsToken: WizardToken;
  let weth: WETH;
  let deployer: SignerWithAddress;
  let wizardsDAO: SignerWithAddress;
  let bidderA: SignerWithAddress;
  let bidderB: SignerWithAddress;
  let whitelistAddrs: SignerWithAddress[];
  let whitelistAddrsArr: string[];
  let whitelistSize: number;
  let creatorsDAO: Wallet;
  let daoWallet: Wallet;
  let snapshotId: number;

  const TIME_BUFFER = 15 * 60;
  const RESERVE_PRICE = BigNumber.from("70000000000000000") // .07 eth;
  const AUCTION_ID = 1;
  const MIN_INCREMENT_BID_PERCENTAGE = 5;
  const DURATION = 60 * 60 * 24;
  const AUCTION_ONE_ONE = true;
  const WIZARD_CAP = 1000;
  const auctionCount = BigNumber.from("3");

  async function deploy(deployer?: SignerWithAddress) {
    const auctionHouseFactory = await ethers.getContractFactory('AuctionHouse', deployer);
    return upgrades.deployProxy(auctionHouseFactory, [
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
      auctionCount,
    ]) as Promise<AuctionHouse>;
  }

  // RH: 
  before(async () => {
    // wizardsDAO is the creators wallet
    [deployer, wizardsDAO, bidderA, bidderB, ...whitelistAddrs] = await ethers.getSigners();

    // RH: save 10 addrs for whitelist 
    whitelistAddrs = whitelistAddrs.slice(4, 14);
    whitelistAddrsArr = whitelistAddrs.map((WLaddr) => WLaddr.address);
    whitelistSize = whitelistAddrsArr.length;

    creatorsDAO = ethers.Wallet.createRandom()
    daoWallet = ethers.Wallet.createRandom()

    wizardsToken = await deployWizardsToken(deployer, wizardsDAO.address, deployer.address);
    weth = await deployWeth(deployer);
    wizardsAuctionHouse = await deploy(deployer);

    const descriptor = await wizardsToken.descriptor();

    await populateDescriptor(Descriptor__factory.connect(descriptor, deployer));

    await wizardsToken.setMinter(wizardsAuctionHouse.address);
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should revert if a second initialization is attempted', async () => {
    const tx = wizardsAuctionHouse.initialize(
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
      auctionCount
    );

    await expect(tx).to.be.revertedWith('Initializable: contract is already initialized');
  });

  it('should allow the owner to unpause the contract and create the first auction', async () => {
    const tx = await wizardsAuctionHouse.unpause();
    await tx.wait();

    const auction = await wizardsAuctionHouse.auctions(AUCTION_ID);
    expect(auction.startTime.toNumber()).to.be.greaterThan(0);
  });

  it('should revert if a user creates a bid for an inactive auction', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);
    const tx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId.add(auctionCount), AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Wizard not up for auction');
  });

  it('should revert if a user creates a bid for an expired auction', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);
    const tx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    await expect(tx).to.be.revertedWith('Auction expired');
  });

  it('should revert if a user creates a bid with an amount below the reserve price', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);
    const tx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE.sub(1),
    });

    await expect(tx).to.be.revertedWith('Must send at least reservePrice');
  });

  it('should revert if a user creates a bid less than the min bid increment percentage', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);
    await wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE.mul(50),
    });

    const tx = wizardsAuctionHouse.connect(bidderB).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE.mul(51),
    });

    await expect(tx).to.be.revertedWith(
      'Must send more than last bid by minBidIncrementPercentage amount',
    );
  });

  it('should refund the previous bidder when the following user creates a bid', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);
    await wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    const bidderAPostBidBalance = await bidderA.getBalance();
    await wizardsAuctionHouse.connect(bidderB).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE.mul(2),
    });
    const bidderAPostRefundBalance = await bidderA.getBalance();

    expect(bidderAPostRefundBalance).to.equal(bidderAPostBidBalance.add(RESERVE_PRICE));
  });

  it('should cap the maximum bid griefing cost at 30K gas + the cost to wrap and transfer WETH', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    const maliciousBidderFactory = new MaliciousBidder__factory(bidderA);
    const maliciousBidder = await maliciousBidderFactory.deploy();

    const maliciousBid = await maliciousBidder
      .connect(bidderA)
      .bid(wizardsAuctionHouse.address, wizardId, AUCTION_ID, {
        value: RESERVE_PRICE,
      });
    await maliciousBid.wait();

    const tx = await wizardsAuctionHouse.connect(bidderB).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE.mul(2),
      gasLimit: 1_000_000,
    });
    const result = await tx.wait();

    expect(result.gasUsed.toNumber()).to.be.lessThan(200_000);
    expect(await weth.balanceOf(maliciousBidder.address)).to.equal(RESERVE_PRICE);
  });

  it('should emit an `AuctionBid` event on a successful bid', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);
    const tx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    await expect(tx)
      .to.emit(wizardsAuctionHouse, 'AuctionBid')
      .withArgs(wizardId, AUCTION_ID, bidderA.address, RESERVE_PRICE, false);
  });

  it('should emit an `AuctionExtended` event if the auction end time is within the time buffer', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId, endTime } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    await ethers.provider.send('evm_setNextBlockTimestamp', [endTime.sub(60 * 5).toNumber()]); // Subtract 5 mins from current end time

    const tx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    await expect(tx)
      .to.emit(wizardsAuctionHouse, 'AuctionExtended')
      .withArgs(wizardId, AUCTION_ID, endTime.add(60 * 10));
  });

  it('should revert if auction settlement is attempted while the auction is still active', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    await wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });
    const tx = wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    await expect(tx).to.be.revertedWith("All auctions have not completed");
  });

  it('should emit `AuctionSettled` and `AuctionCreated` events if all conditions are met', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    await wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
    const tx = await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();

    const receipt = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);

    const settledEvent = receipt.events?.find(e => e.event === 'AuctionSettled');
    const createdEvent = receipt.events?.reverse().find(e => e.event === 'AuctionCreated');

    // auction fee should be in creators account
    expect(await ethers.provider.getBalance(creatorsDAO.address)).to.equal(0);
    
    // ensure that the dao wallet gets 90% of proceeds
    const daoBalance = await ethers.provider.getBalance(daoWallet.address)
    expect(daoBalance).to.equal(RESERVE_PRICE);

    expect(settledEvent?.args?.wizardId).to.equal(wizardId);
    expect(settledEvent?.args?.winner).to.equal(bidderA.address);
    expect(settledEvent?.args?.amount).to.equal(RESERVE_PRICE);

    // when settling a past auction it should create more for next day
    expect(createdEvent?.args?.wizardId).to.equal(wizardId.add(auctionCount.mul(2).sub(1)));
    expect(createdEvent?.args?.startTime).to.equal(timestamp);
    expect(createdEvent?.args?.endTime).to.equal(timestamp + DURATION);
  });

  it('should not create a new auction if the auction house is paused and unpaused while an auction is ongoing', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    await (await wizardsAuctionHouse.pause()).wait();

    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    expect(wizardId).to.equal(1);
  });

  it('should create a new auction if the auction house is paused and unpaused after an auction is settled', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    await wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
      value: RESERVE_PRICE,
    });

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

    await (await wizardsAuctionHouse.pause()).wait();

    const settleTx = wizardsAuctionHouse.connect(bidderA).settleAuction(AUCTION_ID);

    await expect(settleTx)
      .to.emit(wizardsAuctionHouse, 'AuctionSettled')
      .withArgs(wizardId, AUCTION_ID, bidderA.address, RESERVE_PRICE);

    const unpauseTx = await wizardsAuctionHouse.unpause();
    const receipt = await unpauseTx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);

    const createdEvent = receipt.events?.find(e => e.event === 'AuctionCreated');

    expect(createdEvent?.args?.wizardId).to.equal(wizardId.add(auctionCount));
    expect(createdEvent?.args?.startTime).to.equal(timestamp);
    expect(createdEvent?.args?.endTime).to.equal(timestamp + DURATION);
  });

  it('should burn a Wizard on auction settlement if no bids are received', async () => {
    await (await wizardsAuctionHouse.unpause()).wait();

    const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

    await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

    const tx = wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()
    await expect(tx)
      .to.emit(wizardsAuctionHouse, 'AuctionSettled')
      .withArgs(wizardId, AUCTION_ID, '0x0000000000000000000000000000000000000000', 0);
  });

  // RH: 
  describe('Whitelist', async () => {
    it('should correctly add addresses to whitelist and set whitelist size', async () => {

      await (await wizardsAuctionHouse.unpause()).wait();
      const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

      await wizardsAuctionHouse.setWhitelistAddresses(whitelistAddrsArr);

      const currWhitelistSize = await wizardsAuctionHouse.whitelistSize();

      expect(currWhitelistSize).to.equal(whitelistSize);

      for (let i = 0; i < whitelistSize; i += 1) {
        const currWhitelistAddr = await wizardsAuctionHouse.whitelistAddrs(i);
        expect(currWhitelistAddr).to.equal(whitelistAddrsArr[i]);
      }

    });

    it('should set the next set of auctions to be in whitelistDay and \
        emit `Auction Created` with isWhitelistDay set to true', async () => {

      // Set up AuctionHouse with whitelist
      await (await wizardsAuctionHouse.unpause()).wait();
      const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

      await wizardsAuctionHouse.setWhitelistAddresses(whitelistAddrsArr);

      // Fast forward to next day; settle/create auction 
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      // Make sure the transaction emitted the AuctionCreated event correctly 
      const tx = await wizardsAuctionHouse.connect(bidderA)
        .settleCurrentAndCreateNewAuction()
      const receipt = await tx.wait();

      const createdEvent = receipt.events?.reverse().find(e => e.event === 'AuctionCreated');
      expect(createdEvent?.args?.isWhitelistDay).to.equal(true);

      // Make sure all auctions have whitelist 
      for (let i = 1; i <= auctionCount.toNumber(); i += 1) {
        const { isWhitelistDay } = await wizardsAuctionHouse.auctions(i);
        expect(isWhitelistDay).to.equal(true);
      }

    });

    it('should only allow whitelist bids on whitelist days', async () => {
      // Set up AuctionHouse with whitelist
      await (await wizardsAuctionHouse.unpause()).wait();
      await wizardsAuctionHouse.setWhitelistAddresses(whitelistAddrsArr);

      // Fast forward to next day 
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      await (await wizardsAuctionHouse.connect(bidderA)
        .settleCurrentAndCreateNewAuction()).wait();

      const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

      // Ensure only whitelist bidders can bid 
      const whitelistBidder0 = whitelistAddrs[0];
      const whitelistBidder1 = whitelistAddrs[1];

      await (await wizardsAuctionHouse.connect(whitelistBidder0)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE,
        })).wait();

      await (await wizardsAuctionHouse.connect(whitelistBidder1)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE.mul(2),
        })).wait();

      // Don't let non-whitelist bidders place bid 
      const nonWLBidTx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
        value: RESERVE_PRICE.mul(4),
      })
      await expect(nonWLBidTx).to.be.revertedWith('Bidder is not on whitelist');

      // Fast forward and ensure only whitelist bidders are settled as auction winners  
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      const settleWLAuctionTx = await wizardsAuctionHouse.connect(whitelistBidder1)
        .settleCurrentAndCreateNewAuction()
      const receipt = await settleWLAuctionTx.wait();

      const settledEvent = receipt.events?.find(e => e.event === 'AuctionSettled');
      expect(settledEvent?.args?.winner).to.equal(whitelistBidder1.address);

    });

    it('should refresh whitelist after whitelist day', async () => {
      // Set up AuctionHouse with whitelist
      await (await wizardsAuctionHouse.unpause()).wait();
      await wizardsAuctionHouse.setWhitelistAddresses(whitelistAddrsArr);

      // Fast forward to next day 
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      await (await wizardsAuctionHouse.connect(bidderA)
        .settleCurrentAndCreateNewAuction()).wait();

      let { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

      const whitelistBidder = whitelistAddrs[0];
      await (await wizardsAuctionHouse.connect(whitelistBidder)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE,
        })).wait();

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      const settleWLAuctionTx = await wizardsAuctionHouse.connect(whitelistBidder)
        .settleCurrentAndCreateNewAuction()
      const receipt = await settleWLAuctionTx.wait();

      // Ensure auctionCreated has isWhitelistDay = false 
      const createdEvent = receipt.events?.reverse().find(e => e.event === 'AuctionCreated');
      expect(createdEvent?.args?.isWhitelistDay).to.equal(false);

      // Ensure current whitelistSize is 0 
      const currWhitelistSize = await wizardsAuctionHouse.whitelistSize();
      expect(currWhitelistSize).to.equal(0);

      // Ensure next auction is not a whitelist day 
      for (let i = 1; i <= auctionCount.toNumber(); i += 1) {
        const { isWhitelistDay } = await wizardsAuctionHouse.auctions(i);
        expect(isWhitelistDay).to.equal(false);
      }

      // Ensure anyone can bid in the next auction 
      wizardId = (await wizardsAuctionHouse.auctions(AUCTION_ID)).wizardId;

      await (await wizardsAuctionHouse.connect(whitelistBidder)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE,
        })).wait();

      await (await wizardsAuctionHouse.connect(bidderA)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE.mul(2),
        })).wait();

    });

    it('should allow owner to stop whitelist day', async () => {
      // Set up AuctionHouse with whitelist
      await (await wizardsAuctionHouse.unpause()).wait();
      await wizardsAuctionHouse.setWhitelistAddresses(whitelistAddrsArr);

      // Fast forward to next day 
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      await (await wizardsAuctionHouse.connect(bidderA)
        .settleCurrentAndCreateNewAuction()).wait()

      // While whitelist day, only whitelist addrs can bid 
      const { wizardId } = await wizardsAuctionHouse.auctions(AUCTION_ID);

      const nonWLBidTx = wizardsAuctionHouse.connect(bidderA).createBid(wizardId, AUCTION_ID, {
        value: RESERVE_PRICE,
      })
      await expect(nonWLBidTx).to.be.revertedWith('Bidder is not on whitelist');

      const whitelistBidder0 = whitelistAddrs[0];
      await (await wizardsAuctionHouse.connect(whitelistBidder0)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE,
        })).wait();

      // Ensure owner can stop whitelist day 
      await (await wizardsAuctionHouse.stopWhitelistDay()).wait();
      const currWhitelistSize = await wizardsAuctionHouse.whitelistSize();
      expect(currWhitelistSize).to.equal(0);

      for (let i = 1; i <= auctionCount.toNumber(); i += 1) {
        const { isWhitelistDay } = await wizardsAuctionHouse.auctions(i);
        expect(isWhitelistDay).to.equal(false);
      }

      // Ensure anyone can bid in the current auction 
      const whitelistBidder1 = whitelistAddrs[1];
      await (await wizardsAuctionHouse.connect(whitelistBidder1)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE.mul(2),
        })).wait();

      await (await wizardsAuctionHouse.connect(bidderA)
        .createBid(wizardId, AUCTION_ID, {
          value: RESERVE_PRICE.mul(4),
        })).wait();

      // Fast forward to next day and settle auction
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      const settleAuctionTx = await wizardsAuctionHouse.connect(bidderA)
        .settleCurrentAndCreateNewAuction()
      const receipt = await settleAuctionTx.wait();

      const settledEvent = receipt.events?.find(e => e.event === 'AuctionSettled');
      expect(settledEvent?.args?.winner).to.equal(bidderA.address);

    });

  });


  describe('Wizard Extensions', async () => {
    it('should continue to mint after running out of oneOfOnes', async () => {
      // 1 one-of-one
      const receipt = await (await wizardsAuctionHouse.unpause()).wait();

      // 2 one-of-one
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()

      // no more one of ones just mint regular wizard (most expensive because requires traversing all oneofone map)
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      const newReceipt = await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()
      const newReceiptEvents = (newReceipt.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          if (f.args?.oneOfOne == true) {
            return f
          }
        }

        return null;
      })
      expect(newReceiptEvents.length).to.be.eq(0)

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      // should be cheaper because don't have to iterate minted oo map
      const newReceipt2 = await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()

      const gasUsed1 = newReceipt.gasUsed
      const gasUsed2 = newReceipt2.gasUsed

      // last operation should be cheacper
      expect(gasUsed2.lte(gasUsed1)).to.be.eq(true)
    })

    it('should allow owner to change the oneOfOneId that we want to mint', async () => {
      const receipt = await (await wizardsAuctionHouse.unpause()).wait();

      // change the oneOfOneId that we want to mint for the next auction
      await wizardsAuctionHouse.setOneOfOneId(1);

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      const newReceipt = await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()
      const newReceiptEvents = (newReceipt.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          if (f.args?.oneOfOne == true) {
            return f
          }
        }

        return null;
      })

      expect(newReceiptEvents.length).to.be.eq(1)

      // turn off one of one auctioning and make sure we stop selling them
      await wizardsAuctionHouse.setAuctionOneOfOne(false)

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      const newReceiptNo = await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()
      const newReceiptEventsNo = (newReceiptNo.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          if (f.args?.oneOfOne == true) {
            return f
          }
        }

        return null;
      })

      expect(newReceiptEventsNo.length).to.be.eq(0)
    })

    it('should auction "auctionCount" wizards when started', async () => {
      const receipt = await (await wizardsAuctionHouse.unpause()).wait();
      const createdEvents = (receipt.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          return f
        }

        return null;
      })
      expect(createdEvents.length).to.be.eq(auctionCount);
    })

    it('should include a 1/1 wizard in each auction pool unless turned off', async () => {
      const receipt = await (await wizardsAuctionHouse.unpause()).wait();
      const created11Events = (receipt.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          if (f.args?.oneOfOne == true) {
            return f
          }
        }

        return null;
      })
      expect(created11Events.length).to.be.eq(1);

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      const newReceipt = await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()
      const newReceiptEvents = (newReceipt.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          if (f.args?.oneOfOne == true) {
            return f
          }
        }

        return null;
      })

      expect(newReceiptEvents.length).to.be.eq(1);

      // turn off 1/1 auctions and make sure only generated wizards are created.
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      await wizardsAuctionHouse.setAuctionOneOfOne(false);
      const newReceiptNo11 = await (await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).wait()
      const newReceiptNo11Events = (newReceiptNo11.events || []).filter(f => {
        if (f.event == "AuctionCreated") {
          if (f.args?.oneOfOne == true) {
            return f
          }
        }

        return null;
      })

      expect(newReceiptNo11Events.length).to.be.eq(0);
    });

    it('should pause if we cannot mint anymore wizards', async () => {
      await wizardsToken.setSupply(1);
      await wizardsAuctionHouse.setWizardCap(1);
      const receipt = await (await wizardsAuctionHouse.unpause()).wait();

      // wizard ids start at 0 
      const lastWizardId = await wizardsAuctionHouse.lastWizardId();
      expect(lastWizardId).to.be.eq(0);

      // ensure we have cap reached event.
      const receiptEvents = (receipt.events || []).filter(f => {
        if (f.event == "AuctionCapReached") {
          return f
        }

        return null;
      })
      expect(receiptEvents.length).to.be.eq(1);

      // ensure the contract was paused.
      expect(await wizardsAuctionHouse.paused()).to.be.eq(true);

      // ensure any new auctions attempted to be started are reverted while this contract is paused.
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      expect(wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).to.be.reverted;

      // unpausing should revert with all wizards auctioned error.
      expect(wizardsAuctionHouse.unpause()).to.be.revertedWith('All wizards have been auctioned');
    });

    it('should allow updating of the number of wizards available for auction', async () => {
      // minting a 1/1 doesn't mint a wizard for creators so if is enabled we would get wizard id #0 as
      // the last wizard id.
      await wizardsAuctionHouse.setAuctionOneOfOne(false);
      await (await wizardsAuctionHouse.unpause()).wait();
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours to allow auction to end

      // change the num of wizards on auction and kick off a new one with new count
      await wizardsAuctionHouse.setAuctionCount(1);
      await wizardsAuctionHouse.settleCurrentAndCreateNewAuction();

      // wizard ids start at 0 but creators wallet gets the first
      const lastWizardId = await wizardsAuctionHouse.lastWizardId();
      expect(lastWizardId).to.be.eq(4);
    });

    it('should ensure that all wizards get settled when changing auction count', async () => {
      // minting a 1/1 doesn't mint a wizard for creators so if is enabled we would get wizard id #0 as
      // the last wizard id.
      await wizardsAuctionHouse.setAuctionOneOfOne(false);
      await (await wizardsAuctionHouse.unpause()).wait();
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours to allow auction to end

      await wizardsAuctionHouse.setAuctionCount(1);
      const tx = await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();
      const receipt = await tx.wait();
      // change the num of wizards on auction and kick off a new auction with new count
      // ensure only count is settled
      const revents = (receipt.events || []).filter(f => {
        if (f.event == "AuctionSettled") {
          return f
        }

        return null;
      })
      expect(revents.length).to.be.eq(3)

      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours to allow auction to end
      const tx2 = await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();
      const receipt2 = await tx2.wait();

      const revents2 = (receipt2.events || []).filter(f => {
        if (f.event == "AuctionSettled") {
          return f
        }

        return null;
      })
      expect(revents2.length).to.be.eq(1)
    });  
    
    it('should pause if we cannot mint anymore wizards after changing count', async () => {
      await wizardsToken.setSupply(8);
      await wizardsAuctionHouse.setWizardCap(8);
      await wizardsAuctionHouse.unpause()
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

      await wizardsAuctionHouse.setAuctionCount(5);
      const tx = await wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction();
      const receipt = await tx.wait();      
      const revents = (receipt.events || []).filter(f => {
        if (f.event == "AuctionSettled") {
          return f
        }

        return null;
      })
      expect(revents.length).to.be.eq(3)

      // wizard ids start at 0 
      const lastWizardId = await wizardsAuctionHouse.lastWizardId();
      expect(lastWizardId).to.be.eq(7);

      // ensure we have cap reached event.
      const receiptEvents = (receipt.events || []).filter(f => {
        if (f.event == "AuctionCapReached") {
          return f
        }

        return null;
      })
      expect(receiptEvents.length).to.be.eq(1);

      // ensure the contract was paused.
      expect(await wizardsAuctionHouse.paused()).to.be.eq(true);

      // ensure any new auctions attempted to be started are reverted while this contract is paused.
      await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours
      expect(wizardsAuctionHouse.connect(bidderA).settleCurrentAndCreateNewAuction()).to.be.reverted;

      // unpausing should revert with all wizards auctioned error.
      expect(wizardsAuctionHouse.unpause()).to.be.revertedWith('All wizards have been auctioned');
    });
  });
});
