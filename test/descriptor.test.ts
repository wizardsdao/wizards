import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { Descriptor } from '../typechain';
import ImageData from '../files/image-data.json';
import { LongestPart } from './types';
import { deployWizardsDescriptor, populateDescriptor } from './utils';
import { ethers } from 'hardhat';
import { appendFileSync } from 'fs';

chai.use(solidity);
const { expect } = chai;

describe('wizardsDescriptor', () => {
  let wizardsDescriptor: Descriptor;
  let snapshotId: number;

  const part: LongestPart = {
    length: 0,
    index: 0,
  };
    
  const longest: Record<string, LongestPart> = {
    Eye: part,
    Hat: part,
    Mouth: part,
    Skin: part,
    Item: part,
    Cloth: part,
    Acc: part
  };

  before(async () => {
    wizardsDescriptor = await deployWizardsDescriptor();
    
    for (const [l, layer] of Object.entries(ImageData.images)) {
      for (const [i, item] of layer.entries()) {
          if (item.data.length > longest[l]?.length) {
            longest[l] = {
                length: item.data.length,
                index: i,
            };
        }
      }
    }

    await populateDescriptor(wizardsDescriptor);
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  it('should generate valid token uri metadata when data uris are disabled', async () => {
    const BASE_URI = 'https://api.wizardsdao.com/metadata/';

    await wizardsDescriptor.setBaseURI(BASE_URI);
    await wizardsDescriptor.toggleDataURIEnabled();

    const tokenUri = await wizardsDescriptor.tokenURI(0, {
      background: 0,
      eyes: longest.Eye.index,
      mouth: longest.Mouth.index,
      hat: longest.Hat.index,
      skin: longest.Skin.index,
      bgItem: longest.Item.index,
      accessory: longest.Acc.index,
      clothes: longest.Cloth.index,
      oneOfOne: false,
      oneOfOneIndex: 0,
    });
      
    expect(tokenUri).to.equal(`${BASE_URI}0`);
  });

  it('should generate valid token uri metadata when data uris are enabled', async () => {
    const tokenUri = await wizardsDescriptor.tokenURI(0, {
        background: 0,
        eyes: longest.Eye.index,
        mouth: longest.Mouth.index,
        hat: longest.Hat.index,
        skin: longest.Skin.index,
        bgItem: longest.Item.index,
        accessory: longest.Acc.index,
        clothes: longest.Cloth.index,
        oneOfOne: false,
        oneOfOneIndex: 0,
    });
      
    const { name, description, image } = JSON.parse(
      Buffer.from(tokenUri.replace('data:application/json;base64,', ''), 'base64').toString(
        'ascii',
      ),
    );
      
    expect(name).to.equal('Wizard #0');
    expect(description).to.equal('Wizard #0 is a member of the WizardsDAO');
    expect(image).to.not.be.undefined;
  });
    
  it('should generate valid token uri metadata when data uris are enabled for 1/1 pieces', async () => {
    const tokenUri = await wizardsDescriptor.tokenURI(0, {
        background: 0,
        eyes: 0,
        mouth: 0,
        hat: 0,
        skin: 0,
        bgItem: longest.Item.index,
        accessory: longest.Acc.index,
        clothes: longest.Cloth.index,
        oneOfOne: true,
        oneOfOneIndex: 0,
    });
      
    const { name, description, image } = JSON.parse(
        Buffer.from(tokenUri.replace('data:application/json;base64,', ''), 'base64').toString(
            'ascii',
        ),
    );
      
    expect(name).to.equal('Wizard #0');
    expect(description).to.equal('Wizard #0 is a one of one artpiece and a member of the WizardsDAO');
    expect(image).to.not.be.undefined;
  });
});
