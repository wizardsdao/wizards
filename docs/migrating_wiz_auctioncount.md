Migration plan for changing the amount of Wizards to be auctioned.

# Initial migration

1. when a current auction is going on call `pause()` on the auction house contract.

   - allows that users can still bid on the existing auction

   - will not allow settling an entire auction. users however can settle their individual wizard to get their NFT

2. Allow the auction to end

3. run `update-ah` task to update the auction house proxy implementation

   - users can still bid on the existing auction if it is still running otherwise website
     will not allow next auction to start

4. call `setAuctionCount(x)` on the auction house contract where x is the # of wizards to auction
5. Update website with new auction count
6. call `unpause()` on the auction house contract
7. settle current auction by calling `settleCurrentAndCreateNewAuction()`

# Future migrations

If changing the amount of wizards auctioned in the future repeat all steps above except do not update the
auction house implementation (#3)
