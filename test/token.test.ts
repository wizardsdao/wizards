import chai from 'chai';
import { ethers } from 'hardhat';
import { BigNumber as EthersBN, constants, ContractReceipt } from 'ethers';
import { solidity } from 'ethereum-waffle';
import { Descriptor__factory, WizardToken } from '../typechain';
import { deployWizardsToken, populateDescriptor } from './utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { TASK_COMPILE_SOLIDITY_COMPILE } from 'hardhat/builtin-tasks/task-names';

chai.use(solidity);
const { expect } = chai;

describe('WizardsToken', () => {
  let wizardsToken: WizardToken;
  let deployer: SignerWithAddress;
  let wizardsDAO: SignerWithAddress;
  let snapshotId: number;

  before(async () => {
    [deployer, wizardsDAO] = await ethers.getSigners();
    wizardsToken = await deployWizardsToken(deployer, wizardsDAO.address, deployer.address);

    const descriptor = await wizardsToken.descriptor();
    await populateDescriptor(Descriptor__factory.connect(descriptor, deployer));
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should allow the minter to mint a wizard to itself and a reward wizard to the wizardsDAO', async () => {
    const receipt = await (await wizardsToken.mint()).wait();

    const [, , creatorsWizardCreated, , , ownersWizardCreated] = receipt.events || [];

    expect(await wizardsToken.ownerOf(0)).to.eq(wizardsDAO.address);
    expect(creatorsWizardCreated?.event).to.eq('WizardCreated');
    expect(creatorsWizardCreated?.args?.tokenId).to.eq(0);
    expect(creatorsWizardCreated?.args?.seed.length).to.equal(10);

    expect(await wizardsToken.ownerOf(1)).to.eq(deployer.address);
    expect(ownersWizardCreated?.event).to.eq('WizardCreated');
    expect(ownersWizardCreated?.args?.tokenId).to.eq(1);

    // ensure we have all properties for a seed
    expect(ownersWizardCreated?.args?.seed.length).to.equal(10);

    creatorsWizardCreated?.args?.seed.forEach((item: EthersBN | number) => {
      // ignore 1of1 seed prop
      if (typeof item != 'boolean') {
        const value = typeof item !== 'number' ? item?.toNumber() : item;
        expect(value).to.be.a('number');
      }
    });

    ownersWizardCreated?.args?.seed.forEach((item: EthersBN | number) => {
      if (typeof item != 'boolean') {
        const value = typeof item !== 'number' ? item?.toNumber() : item;
        expect(value).to.be.a('number');
      }
    });
  });

  it('should set symbol', async () => {
    expect(await wizardsToken.symbol()).to.eq('WIZ');
  });

  it('should set name', async () => {
    expect(await wizardsToken.name()).to.eq('Wizards');
  });

  it('should allow minter to mint a wizard to itself', async () => {
    await (await wizardsToken.mint()).wait();
    const receipt = await (await wizardsToken.mint()).wait();

    const wizardCreated = receipt.events?.[2];

    expect(await wizardsToken.ownerOf(2)).to.eq(deployer.address);
    expect(wizardCreated?.event).to.eq('WizardCreated');
    expect(wizardCreated?.args?.tokenId).to.eq(2);
    expect(wizardCreated?.args?.seed.length).to.equal(10);

    wizardCreated?.args?.seed.forEach((item: EthersBN | number) => {
      // ignore 1of1 seed prop
      if (typeof item != 'boolean') {
        const value = typeof item !== 'number' ? item?.toNumber() : item;
        expect(value).to.be.a('number');
      }
    });
  });

  it('should emit two transfer logs on mint', async () => {
    const [, , creator, minter] = await ethers.getSigners();

    await (await wizardsToken.mint()).wait();

    await (await wizardsToken.setMinter(minter.address)).wait();
    await (await wizardsToken.transferOwnership(creator.address)).wait();

    const tx = wizardsToken.connect(minter).mint();

    await expect(tx)
      .to.emit(wizardsToken, 'Transfer')
      .withArgs(constants.AddressZero, creator.address, 2);
    await expect(tx).to.emit(wizardsToken, 'Transfer').withArgs(creator.address, minter.address, 2);
  });

  it('should allow minter to burn a wizard', async () => {
    await (await wizardsToken.mint()).wait();

    const tx = wizardsToken.burn(0);
    await expect(tx).to.emit(wizardsToken, 'WizardBurned').withArgs(0);
  });

  it('should revert on non-minter mint', async () => {
    const account = wizardsToken.connect(wizardsDAO);
    await expect(account.mint()).to.be.reverted;
  });

  describe('contractURI', async () => {
    it('should return correct contractURI', async () => {
      expect(await wizardsToken.contractURI()).to.eq(
        'ipfs://QmYURRfzZH7UkUmffxYifyTbyQu5axg8tt9wG92wpSoigi',
      );
    });
    it('should allow owner to set contractURI', async () => {
      await wizardsToken.setContractURIHash('XXX');
      expect(await wizardsToken.contractURI()).to.eq('ipfs://XXX');
    });
    it('should not allow non owner to set contractURI', async () => {
      const [, nonOwner] = await ethers.getSigners();
      await expect(wizardsToken.connect(nonOwner).setContractURIHash('BAD')).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('Wizard Extensions', async () => {
    it('should send a wizard to the wizardCreators address every 6 wizards and a max of 54', async () => {
      // 0
      const first = await (await wizardsToken.mint()).wait();
      const [, , creatorsWizardCreated1] = first.events || [];
      const lastTokenId1 = creatorsWizardCreated1?.args?.tokenId;
      expect(await wizardsToken.ownerOf(lastTokenId1)).to.eq(wizardsDAO.address);

      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();

      // 6
      const second = await (await wizardsToken.mint()).wait();
      const [, , creatorsWizardCreated2] = second.events || [];
      const lastTokenId2 = creatorsWizardCreated2?.args?.tokenId;
      expect(await wizardsToken.ownerOf(lastTokenId2)).to.eq(wizardsDAO.address);

      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();

      // 12
      const third = await (await wizardsToken.mint()).wait();
      const [, , creatorsWizardCreated3] = third.events || [];
      const lastTokenId3 = creatorsWizardCreated3?.args?.tokenId;
      expect(await wizardsToken.ownerOf(lastTokenId3)).to.eq(wizardsDAO.address);

      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();
      await (await wizardsToken.mint()).wait();

      // 18
      const fourth = await (await wizardsToken.mint()).wait();
      const [, , creatorsWizardCreated4] = fourth.events || [];
      const lastTokenId4 = creatorsWizardCreated4?.args?.tokenId;
      expect(await wizardsToken.ownerOf(lastTokenId4)).to.eq(wizardsDAO.address);
      expect(creatorsWizardCreated4?.args?.tokenId).to.eq(18)

      const times = new Array<number>(300);
      let owned = 4
      for (let _ of times) {
        const r = await (await wizardsToken.mint()).wait();
        const filtered = r.events?.filter(e => {
          return e.event === "WizardCreated"
        })

        // ensure we stop assigning to creators dao after 54 are minted
        for (let f of filtered || []) {
          let tokId = f.args?.tokenId.toNumber()
          const owner = await wizardsToken.ownerOf(tokId)
          if (owner == wizardsDAO.address) {
            owned++
          }

          // last creators wizard
          if (tokId == 318) {
            expect(owner).to.eq(wizardsDAO.address);
          } else if (tokId > 318) {
            // ensure is never creators address
            expect(owner).to.eq(deployer.address);
          }
        }
      }

      // creatorsDAO should get max 54 wizards
      expect(owned).to.eq(54)
    });

    it('should allow setting of total supply and failing when supply reached', async () => {
      // wizardID is 0 based, mint will create one for creators and one for circulation
      await wizardsToken.setSupply(2)
      await wizardsToken.mint()

      // should not be able to mint a 3rd one
      expect(wizardsToken.mint()).to.be.revertedWith("All wizards have been minted");
    })

    it('allow us to mint a 1-1 wizard', async () => {
      await wizardsToken.mintOneOfOne(0);
    })

    it('should error if specifying a 1-1 out of range', async () => {
      expect(wizardsToken.mintOneOfOne(10)).to.be.revertedWith("one of one does not exist")
    })
  })
});
