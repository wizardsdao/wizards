import {
  WizardToken__factory,
  AuctionHouse__factory,
  Descriptor__factory,
  Seeder__factory,
} from '../../../dist/src/';
import type { Signer } from 'ethers';
import type { Provider } from '@ethersproject/providers';
import { getContractAddressesForChainOrThrow } from './addresses';
import { Contracts } from './types';

/**
 * Get contract instances that target the Ethereum mainnet
 * or a supported testnet. Throws if there are no known contracts
 * deployed on the corresponding chain.
 * @param chainId The desired chain id
 * @param signerOrProvider The ethers v5 signer or provider
 */
export const getContractsForChainOrThrow = (
  chainId: number,
  signerOrProvider?: Signer | Provider,
): Contracts => {
  const addresses = getContractAddressesForChainOrThrow(chainId);

  return {
    wizardTokenContract: WizardToken__factory.connect(
      addresses.wizardToken,
      signerOrProvider as Signer | Provider,
    ),
    auctionHouseContract: AuctionHouse__factory.connect(
      addresses.auctionHouseProxy,
      signerOrProvider as Signer | Provider,
    ),
    descriptorContract: Descriptor__factory.connect(
      addresses.descriptor,
      signerOrProvider as Signer | Provider,
    ),
    seederContract: Seeder__factory.connect(
      addresses.seeder,
      signerOrProvider as Signer | Provider,
    ),
  };
};
