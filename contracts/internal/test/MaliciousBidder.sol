// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.6;

import { IAuctionHouse } from '../auctionhouse/IAuctionHouse.sol';

contract MaliciousBidder {
    function bid(IAuctionHouse auctionHouse, uint256 wizardId, uint8 auctionId) public payable {
        auctionHouse.createBid{ value: msg.value }(wizardId, auctionId);
    }

    receive() external payable {
        assembly {
            invalid()
        }
    }
}
