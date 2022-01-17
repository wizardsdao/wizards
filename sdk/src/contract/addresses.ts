import { ChainId, ContractAddresses } from './types';

const chainIdToAddresses: { [chainId: number]: ContractAddresses } = {
  [ChainId.Local]: {
    wizardToken: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    seeder: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    descriptor: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    nftDescriptor: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    auctionHouse: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    auctionHouseProxy: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
    auctionHouseProxyAdmin: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  },
  [ChainId.Mainnet]: {
    wizardToken: '0xC23b12EBA3af92dc3Ec94744c0c260caD0EeD0e5',
    seeder: '0xBD5CCd56400460E8E72209476f65c77774d18482',
    descriptor: '0x51B2CCc1c72520D6024443CE11405Fd0C7f73A6a',
    nftDescriptor: '0x6B06f5e119868b3Aa688CF7249701Ce2a603Fa79',
    auctionHouse: '0xa5A516EC08b42464CE4e1A1ACAb968b8a0fB9c24',
    auctionHouseProxy: '0x418CbB82f7472B321c2C5Ccf76b8d9b6dF47Daba',
    auctionHouseProxyAdmin: '0xB0cbF686D058091ba484d1899f9Bc0Cb2C233FE0',
  },
  [ChainId.Rinkeby]: {
    wizardToken: '0xed998315Dd687E105D24aA694AFcF2a7F66e1A48',
    seeder: '0x2bc7f33A8B39116f18165d675B0Ab167dc0939E6',
    descriptor: '0x7d6D176a896347C88beb0ea7d02afA2156433f6b',
    nftDescriptor: '0xA916835abAbF6B0382C8A206D413Fb549DF3fa5f',
    auctionHouse: '0xA860807a2DE81CA813b027866CF5c5a9592CD07F',
    auctionHouseProxy: '0x43fD66E541D0e800ba26Fd77459cBC0f43cFE68C',
    auctionHouseProxyAdmin: '0xE9438F375EcC53D8190559FE6C785FDa499d7959',
  },
};

/**
 * Get addresses of contracts that have been deployed to the
 * Ethereum mainnet or a supported testnet. Throws if there are
 * no known contracts deployed on the corresponding chain.
 * @param chainId The desired chainId
 */
export const getContractAddressesForChainOrThrow = (chainId: number): ContractAddresses => {
  if (!chainIdToAddresses[chainId]) {
    throw new Error(
      `Unknown chain id (${chainId}). No known contracts have been deployed on this chain.`,
    );
  }

  console.log('addresses',chainIdToAddresses[chainId])
  return chainIdToAddresses[chainId];
};
