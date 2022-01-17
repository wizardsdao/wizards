import {
  WizardToken__factory,
  AuctionHouse__factory,
  Descriptor__factory,
  Seeder__factory,
} from '../../../dist/src/';

export interface ContractAddresses {
  wizardToken: string;
  seeder: string;
  descriptor: string;
  nftDescriptor: string;
  auctionHouse: string;
  auctionHouseProxy: string;
  auctionHouseProxyAdmin: string;
}

export interface Contracts {
  wizardTokenContract: ReturnType<typeof WizardToken__factory.connect>;
  auctionHouseContract: ReturnType<typeof AuctionHouse__factory.connect>;
  descriptorContract: ReturnType<typeof Descriptor__factory.connect>;
  seederContract: ReturnType<typeof Seeder__factory.connect>;
}

export enum ChainId {
  Mainnet = 1,
  Ropsten = 3,
  Rinkeby = 4,
  Kovan = 42,
  Local = 31337,
}
