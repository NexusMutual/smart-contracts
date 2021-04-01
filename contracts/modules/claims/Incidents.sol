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
import "../../interfaces/IPooledStaking.sol";
import "../capital/Pool.sol";
import "../claims/ClaimsData.sol";
import "../claims/ClaimsReward.sol";
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

  Incident[] public incidents;

  // covered token => peg token
  mapping(address => address) public underlyingTokens;

  // claim id => payout
  mapping(uint => uint) public claimPayouts;

  enum ID {CD, CR, QD, TC, MR, PO, PS}
  mapping(uint => address payable) contracts;

  function instance(ID id) internal view returns (address payable) {
    return contracts[uint(id)];
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

    address underlying = underlyingTokens[coveredToken];
    require(underlying != address(0), 'Unsupported token');

    Incident memory incident = Incident(
      uint32(incidentDate),
      uint112(priceBefore),
      uint112(priceAfter),
      coveredToken
    );
    incidents.push(incident);

    // TODO: emit event
  }

  function redeemPayout(
    uint coverId,
    uint incidentId,
    uint tokenAmount
  ) external returns (uint claimId, uint payout) {

    Incident memory incident = incidents[incidentId];
    address coverOwner;
    address coveredToken;
    uint sumAssured;

    {
      QuotationData quotationData = QuotationData(instance(ID.QD));
      bytes4 currency;

      (
      /* id */, coverOwner, coveredToken,
      currency, sumAssured, /* premiumNXM */
      ) = quotationData.getCoverDetailsByCoverID1(coverId);

      // check ownership
      require(msg.sender == coverOwner, 'Not cover owner');

      {
        // check validity
        uint coverPeriod = uint(quotationData.getCoverPeriod(coverId)).mul(1 days);
        uint coverExpirationDate = quotationData.getValidityOfCover(coverId);
        uint coverStartDate = coverExpirationDate.sub(coverPeriod);
        require(coverStartDate >= incident.date, 'Cover start date before the incident');
        require(coverExpirationDate <= incident.date, 'Cover end date after the incident');
      }

      {
        // TODO: add the opposite check in Claims.sol
        // check covered protocol and cover currency
        ClaimsReward claimsReward = ClaimsReward(instance(ID.CR));
        address currencyAssetAddress = claimsReward.getCurrencyAssetAddress(currency);
        require(coveredToken == currencyAssetAddress, 'Cover asset does not match covered token underlying asset');
        require(coveredToken == incident.coveredToken, 'Covered token does not match incident token');
      }

      // decrese total sum assured
      quotationData.subFromTotalSumAssured(currency, sumAssured);
      quotationData.subFromTotalSumAssuredSC(coveredToken, currency, sumAssured);
    }

    {
      // min/max checks. sumAssured assumes 18 decimals
      uint coverAmount = sumAssured.mul(1e18);
      uint maxAmount = coverAmount.div(incident.priceBefore);
      uint minAmount = maxAmount.mul(20).div(100);

      require(tokenAmount <= maxAmount, 'Amount exceeds sum assured');
      require(tokenAmount >= minAmount, 'Amount is less than 20% of sum assured');

      // tokenAmount / maxAmount * coverAmount
      payout = tokenAmount.mul(coverAmount).div(maxAmount);
    }

    {
      // mark cover as having a successful claim
      TokenController tokenController = TokenController(instance(ID.TC));
      tokenController.markCoverClaimOpen(coverId);
      tokenController.markCoverClaimClosed(coverId, true);

      // create the claim
      ClaimsData claimsData = ClaimsData(instance(ID.CD));
      claimId = claimsData.actualClaimLength();
      claimsData.addClaim(claimId, coverId, coverOwner, now);
      claimsData.callClaimEvent(coverId, coverOwner, claimId, now);
      claimPayouts[claimId] = payout;
    }

    {
      Pool pool = Pool(instance(ID.PO));
      IPooledStaking pooledStaking = IPooledStaking(instance(ID.PS));
      MemberRoles memberRoles = MemberRoles(instance(ID.MR));

      address underlying = underlyingTokens[coveredToken];

      // send the payout
      address payable coverOwnerPayable = address(uint160(coverOwner));
      address payable payoutAddress = memberRoles.getClaimPayoutAddress(coverOwnerPayable);
      IERC20(coveredToken).safeTransferFrom(msg.sender, address(this), tokenAmount);
      bool success = pool.sendClaimPayout(underlying, payoutAddress, payout);
      require(success, 'Incidents: Payout failed');

      // burn
      uint burnAmount = pool.getTokenPrice(underlying).mul(payout);
      pooledStaking.pushBurn(coveredToken, burnAmount);
    }
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
    contracts[uint(ID.CD)] = master.getLatestAddress('CD');
    contracts[uint(ID.CR)] = master.getLatestAddress('CR');
    contracts[uint(ID.QD)] = master.getLatestAddress('QD');
    contracts[uint(ID.TC)] = master.getLatestAddress('TC');
    contracts[uint(ID.MR)] = master.getLatestAddress('MR');
    contracts[uint(ID.PO)] = master.getLatestAddress('PO');
    contracts[uint(ID.PS)] = master.getLatestAddress('PS');
  }

}
