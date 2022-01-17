import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  Descriptor,
  Descriptor__factory,
  WizardToken,
  WizardToken__factory,
  Seeder,
  Seeder__factory,
  WETH,
  WETH__factory,
} from '../typechain';
import ImageData from '../files/image-data.json';
import { Block } from '@ethersproject/abstract-provider';
import { chunkArray } from '../utils';

export type TestSigners = {
  deployer: SignerWithAddress;
  account0: SignerWithAddress;
  account1: SignerWithAddress;
  account2: SignerWithAddress;
};

export const getSigners = async (): Promise<TestSigners> => {
  const [deployer, account0, account1, account2] = await ethers.getSigners();
  return {
    deployer,
    account0,
    account1,
    account2,
  };
};

export const deployWizardsDescriptor = async (
  deployer?: SignerWithAddress,
): Promise<Descriptor> => {
  const signer = deployer || (await getSigners()).deployer;
  const nftDescriptorLibraryFactory = await ethers.getContractFactory('NFTDescriptor', signer);
  const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy();
  const wizardsDescriptorFactory = new Descriptor__factory(
    {
      __$ca3b859211b1a9a5742dc282f70bfa123b$__: nftDescriptorLibrary.address,
    },
    signer,
  );

  return wizardsDescriptorFactory.deploy();
};

export const deployWizardsSeeder = async (deployer?: SignerWithAddress): Promise<Seeder> => {
  const factory = new Seeder__factory(deployer || (await getSigners()).deployer);
  return factory.deploy();
};

export const deployWizardsToken = async (
  deployer?: SignerWithAddress,
  wizardsDAO?: string,
  minter?: string,
  descriptor?: string,
  seeder?: string,
  proxyRegistryAddress?: string,
  supply?: number,
): Promise<WizardToken> => {
  const signer = deployer || (await getSigners()).deployer;
  const factory = new WizardToken__factory(signer);

  return factory.deploy(
    wizardsDAO || signer.address,
    minter || signer.address,
    descriptor || (await deployWizardsDescriptor(signer)).address,
    seeder || (await deployWizardsSeeder(signer)).address,
    proxyRegistryAddress || address(0),
    supply || 1000,
  );
};

export const deployWeth = async (deployer?: SignerWithAddress): Promise<WETH> => {
  const factory = new WETH__factory(deployer || (await await getSigners()).deployer);
  return factory.deploy();
};

export const populateDescriptor = async (wizardsDescriptor: Descriptor): Promise<void> => {
  const { bgcolors, palette, images } = ImageData;
  const { eye, hat, mouth, skin, item, cloth, acc } = images;

  // Split up head and accessory population due to high gas usage
  await Promise.all([
    wizardsDescriptor.addManyBackgrounds(bgcolors),
    wizardsDescriptor.addManyColorsToPalette(0, palette),
    wizardsDescriptor.addManyHats(hat.map(({ data }) => data)),
    wizardsDescriptor.addManyBgItems(item.map(({ data }) => data)),
    wizardsDescriptor.addManyClothes(cloth.map(({ data }) => data)),
    wizardsDescriptor.addManyAccessories(acc.map(({ data }) => data)),

    chunkArray(eye, 10).map(chunk =>
      wizardsDescriptor.addManyEyes(chunk.map(({ data }) => data)),
    ),
    chunkArray(mouth, 10).map(chunk =>
      wizardsDescriptor.addManyMouths(chunk.map(({ data }) => data))
    ),
    chunkArray(skin, 10).map(chunk =>
      wizardsDescriptor.addManySkins(chunk.map(({ data }) => data))
    ),
    // simulate 1-1 with skins.
    chunkArray(skin.slice(-2), 10).map(chunk =>
      wizardsDescriptor.addManyOneOfOnes(chunk.map(({ data }) => data))
    ),
  ]);
};

/**
 * Return a function used to mint `amount` wizards on the provided `token`
 * @param token The wizards ERC721 token
 * @param amount The number of wizards to mint
 */
export const MintWizards = (
  token: WizardToken,
  burnWizardDAOTokens = true,
): ((amount: number) => Promise<void>) => {
  return async (amount: number): Promise<void> => {
    for (let i = 0; i < amount; i++) {
      await token.mint();
    }
    if (!burnWizardDAOTokens) return;
    await setTotalSupply(token, amount);
  };
};

/**
 * Mints or burns tokens to target a total supply. Due to WizardDAO's rewards tokens may be burned and tokenIds will not be sequential
 */
export const setTotalSupply = async (token: WizardToken, newTotalSupply: number): Promise<void> => {
  const totalSupply = (await token.totalSupply()).toNumber();

  if (totalSupply < newTotalSupply) {
    for (let i = 0; i < newTotalSupply - totalSupply; i++) {
      await token.mint();
    }
    // If WizardDAO's reward tokens were minted totalSupply will be more than expected, so run setTotalSupply again to burn extra tokens
    await setTotalSupply(token, newTotalSupply);
  }

  if (totalSupply > newTotalSupply) {
    for (let i = newTotalSupply; i < totalSupply; i++) {
      await token.burn(i);
    }
  }
};

// The following adapted from `https://github.com/compound-finance/compound-protocol/blob/master/tests/Utils/Ethereum.js`

const rpc = <T = unknown>({
  method,
  params,
}: {
  method: string;
  params?: unknown[];
}): Promise<T> => {
  return network.provider.send(method, params);
};

export const encodeParameters = (types: string[], values: unknown[]): string => {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
};

export const blockByNumber = async (n: number | string): Promise<Block> => {
  return rpc({ method: 'eth_getBlockByNumber', params: [n, false] });
};

export const increaseTime = async (seconds: number): Promise<unknown> => {
  await rpc({ method: 'evm_increaseTime', params: [seconds] });
  return rpc({ method: 'evm_mine' });
};

export const freezeTime = async (seconds: number): Promise<unknown> => {
  await rpc({ method: 'evm_increaseTime', params: [-1 * seconds] });
  return rpc({ method: 'evm_mine' });
};

export const advanceBlocks = async (blocks: number): Promise<void> => {
  for (let i = 0; i < blocks; i++) {
    await mineBlock();
  }
};

export const blockNumber = async (parse = true): Promise<number> => {
  const result = await rpc<number>({ method: 'eth_blockNumber' });
  return parse ? parseInt(result.toString()) : result;
};

export const blockTimestamp = async (
  n: number | string,
  parse = true,
): Promise<number | string> => {
  const block = await blockByNumber(n);
  return parse ? parseInt(block.timestamp.toString()) : block.timestamp;
};

export const setNextBlockTimestamp = async (n: number, mine = true): Promise<void> => {
  await rpc({ method: 'evm_setNextBlockTimestamp', params: [n] });
  if (mine) await mineBlock();
};

export const minerStop = async (): Promise<void> => {
  await network.provider.send('evm_setAutomine', [false]);
  await network.provider.send('evm_setIntervalMining', [0]);
};

export const minerStart = async (): Promise<void> => {
  await network.provider.send('evm_setAutomine', [true]);
};

export const mineBlock = async (): Promise<void> => {
  await network.provider.send('evm_mine');
};

export const chainId = async (): Promise<number> => {
  return parseInt(await network.provider.send('eth_chainId'), 16);
};

export const address = (n: number): string => {
  return `0x${n.toString(16).padStart(40, '0')}`;
};
