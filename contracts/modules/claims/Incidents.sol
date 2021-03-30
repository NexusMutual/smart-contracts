/* Copyright (C) 2021 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../abstract/MasterAware.sol";
import "../capital/Pool.sol";
import "../cover/QuotationData.sol";
import "../governance/MemberRoles.sol";
import "../token/TokenController.sol";

contract Incidents is MasterAware {
  using SafeERC20 for IERC20;
  using SafeMath for uint;

  struct Incident {
    uint32 date;
    uint112 priceBefore;
    uint112 priceAfter;
    address coveredToken;
  }

  uint public incidentCount;

  // incident id => incident details
  mapping(uint => Incident) public incidents;

  // covered token => peg token
  mapping(address => address) public underlyingTokens;

  // claim id => payout
  mapping(address => uint) public claimPayouts;

  QuotationData public qd;
  TokenController public tc;
  Pool public po;
  MemberRoles public mr;

  modifier onlyQuoteEngine {
    address quoteEngine = qd.getAuthQuoteEngine();
    require(msg.sender == quoteEngine);
    _;
  }

  function setCoveredToken(
    address coveredToken,
    address underlyingToken
  ) external onlyGovernance {
    underlyingTokens[coveredToken] = underlyingToken;
  }

  function addIncident(
    address coveredToken,
    uint incidentDate,
    uint priceBefore,
    uint priceAfter
  ) external onlyGovernance {

    require(priceBefore > priceAfter, 'No depeg');

    address peggedTo = underlyingTokens[coveredToken];
    require(peggedTo != address(0), 'Unsupported token');

    uint count = incidentCount;
    incidentCount = count.add(1);

    incidents[count] = Incident(
      incidentDate,
      priceBefore,
      priceAfter,
      coveredToken
    );

    // TODO: emit event
  }

  function redeemPayout(
    uint coverId,
    uint incidentId,
    uint tokenAmount
  ) external returns (uint claimId, uint payout) {

    (
    /* id */, address coverOwner, address coveredToken,
    /* currency */, uint sumAssured, /* premiumNXM */
    ) = qd.getCoverDetailsByCoverID1(coverId);

    uint coverPeriod = qd.getCoverPeriod(coverId).mul(1 days);
    uint coverExpirationDate = qd.getValidityOfCover(coverId);
    uint coverStartDate = coverExpirationDate.sub(coverPeriod);

    // assumes 18 decimals
    uint coverAmount = sumAssured.mul(1e18);

    address payoutAddress = mr.getClaimPayoutAddress(coverOwner);

    // check ownership
    require(msg.sender = coverOwner, 'Not cover owner');

    // check validity
    Incident memory incident = incidents[incidentId];
    require(coverStartDate >= incident.date, 'Cover start date before the incident');
    require(coverExpirationDate <= incident.date, 'Cover end date after the incident');

    // TODO: add the opposite check in Claims.sol
    // check covered protocol
    require(coveredToken == incident.coveredToken, 'Covered token does not match incident token');

    uint maxAmount = coverAmount.div(incident.priceBefore);
    require(tokenAmount <= maxAmount, 'Amount exceeds sum assured');

    // min payout = 20%
    uint minAmount = maxAmount.mul(20).div(100);
    require(tokenAmount >= minAmount, 'Amount is less than 20% of sum assured');

    // mark cover as having a successful claim
    tc.markCoverClaimOpen(coverId);
    tc.markCoverClaimClosed(coverId, true);

    // tokenAmount / maxAmount * coverAmount
    payout = tokenAmount.mul(coverAmount).div(maxAmount);
    address peggedTo = underlyingTokens[coveredToken];

    // TODO: create claim in CD?
    claimId = 1;
    claimPayouts[claimId] = payout;

    IERC20(coveredToken).safeTransferFrom(msg.sender, address(this), amount);
    po.sendClaimPayout(peggedTo, payoutAddress, payout);

    // TODO: emit event
  }

  function withdrawAsset(
    address asset,
    address destination,
    uint amount
  ) external onlyGovernance {
    // TODO: emit event
    IERC20(asset).safeTransfer(destination, amount);
  }

  function changeDependentContractAddress() external {
    INXMMaster master = INXMMaster(master);
    qd = QuotationData(master.getLatestAddress('QD'));
    tc = TokenController(master.getLatestAddress('TC'));
    po = Pool(master.getLatestAddress('P1'));
    mr = MemberRoles(master.getLatestAddress('MR'));
  }

}
