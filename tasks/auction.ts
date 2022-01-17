import "@nomiclabs/hardhat-ethers";
import { task, types } from 'hardhat/config';

task('settle-auction', 'Settles the current auction and starts a new one')
  .addParam(
    'ahaddress',
    'The auctionhouse proxy contract address',
    '0x0165878A594ca255338adfa4d48449f69242Eb8F',
    types.string,
  )
  .setAction(async ({ahaddress}, { ethers }) => {
    const auctionHouse = await ethers.getContractFactory('AuctionHouse');
    const auctionHouseContract = auctionHouse.attach(ahaddress);
    const paused = await auctionHouseContract.paused()
    
    if (paused) {
      try {
        console.log('contract is paused... unpausing')
        await auctionHouseContract.unpause();
      } catch (ex) {
        console.log('unpause ex:', ex)
      }
    } else {
      try {
        console.log("calling settle auction")
        await auctionHouseContract.settleCurrentAndCreateNewAuction();
      } catch (ex) {
        if ((ex as Error).message.indexOf("All auctions have not completed") > -1) {
          console.log('attempted to settle but there is an outstanding auction')
        }
      }
    }
});
