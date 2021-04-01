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

  // contract identifiers
  enum ID {CD, CR, QD, TC, MR, P1, PS}

  mapping(uint => address payable) contracts;

  Incident[] public incidents;

  // covered token => peg token
  mapping(address => address) public underlyingTokens;

  // claim id => payout amount
  mapping(uint => uint) public claimPayouts;

  function addUnderlyingToken(
    address coveredToken,
    address underlyingToken
  ) external onlyGovernance {
    require(underlyingTokens[coveredToken] == address(0), "Incidents: Underlying token already set");
    underlyingTokens[coveredToken] = underlyingToken;
  }

  function addIncident(
    address coveredToken,
    uint incidentDate,
    uint priceBefore,
    uint priceAfter
  ) external onlyGovernance {

    require(priceBefore > priceAfter, "Incidents: No depeg");

    address underlying = underlyingTokens[coveredToken];
    require(underlying != address(0), "Incidents: Unsupported token");

    Incident memory incident = Incident(
      uint32(incidentDate),
      uint112(priceBefore),
      uint112(priceAfter),
      coveredToken
    );
    incidents.push(incident);
  }

  function getCoverDetails(QuotationData qd, uint coverId) internal view returns (
    address coveredToken,
    address coverOwner,
    uint coverStartDate,
    uint coverExpirationDate,
    uint sumAssured,
    bytes4 currency
  ) {

    (
    /* id */, coverOwner, coveredToken,
    currency, sumAssured, /* premiumNXM */
    ) = qd.getCoverDetailsByCoverID1(coverId);

    uint coverPeriod = uint(qd.getCoverPeriod(coverId)).mul(1 days);
    coverExpirationDate = qd.getValidityOfCover(coverId);
    coverStartDate = coverExpirationDate.sub(coverPeriod);
  }

  function redeemPayout(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount
  ) external returns (uint claimId, uint payoutAmount) {

    Incident memory incident = incidents[incidentId];
    address coverOwner;
    address coveredToken;
    address underlyingToken;
    uint sumAssured;

    {
      QuotationData qd = quotationData();
      uint coverExpirationDate;
      uint coverStartDate;
      bytes4 currency;

      (
      coveredToken, coverOwner, coverStartDate,
      coverExpirationDate, sumAssured, currency
      ) = getCoverDetails(qd, coverId);

      // check ownership & validity
      require(msg.sender == coverOwner, "Incidents: Not cover owner");
      require(coverStartDate >= incident.date, "Incidents: Cover start date before the incident");
      require(coverExpirationDate <= incident.date, "Incidents: Cover end date after the incident");

      {
        // check covered protocol
        require(coveredToken == incident.coveredToken, "Incidents: Covered token != incident token");

        // note: technically this check should have happened at cover purchase time
        underlyingToken = underlyingTokens[coveredToken];
        address coverCurrencyAddress = claimsReward().getCurrencyAssetAddress(currency);
        require(coverCurrencyAddress == underlyingToken, "Incidents: Cover asset != underlying asset");
      }

      // decrese total sum assured
      qd.subFromTotalSumAssured(currency, sumAssured);
      qd.subFromTotalSumAssuredSC(coveredToken, currency, sumAssured);
    }

    {
      // min/max checks. sumAssured assumes 18 decimals
      uint coverAmount = sumAssured.mul(1e18);
      uint maxAmount = coverAmount.div(incident.priceBefore);
      uint minAmount = maxAmount.mul(20).div(100);

      require(coveredTokenAmount <= maxAmount, "Incidents: Amount exceeds sum assured");
      require(coveredTokenAmount >= minAmount, "Incidents: Amount is less than 20% of sum assured");

      // coveredTokenAmount / maxAmount * coverAmount
      payoutAmount = coveredTokenAmount.mul(coverAmount).div(maxAmount);
    }

    {
      // mark cover as having a successful claim
      TokenController tc = tokenController();
      tc.markCoverClaimOpen(coverId);
      tc.markCoverClaimClosed(coverId, true);

      // create the claim
      ClaimsData cd = claimsData();
      claimId = cd.actualClaimLength();
      cd.addClaim(claimId, coverId, coverOwner, now);
      cd.callClaimEvent(coverId, coverOwner, claimId, now);
      claimPayouts[claimId] = payoutAmount;
    }

    {
      Pool p1 = pool();
      address payable coverOwnerPayable = address(uint160(coverOwner));
      address payable payoutAddress = memberRoles().getClaimPayoutAddress(coverOwnerPayable);

      // pull depeged tokens and send the payoutAmount
      IERC20(coveredToken).safeTransferFrom(msg.sender, address(this), coveredTokenAmount);
      bool success = p1.sendClaimPayout(underlyingToken, payoutAddress, payoutAmount);
      require(success, "Incidents: Payout failed");

      // burn
      uint burnAmount = p1.getTokenPrice(underlyingToken).mul(payoutAmount);
      pooledStaking().pushBurn(coveredToken, burnAmount);
    }
  }

  function withdrawAsset(
    address asset,
    address destination,
    uint amount
  ) external onlyGovernance {
    IERC20(asset).safeTransfer(destination, amount);
  }

  function claimsData() internal view returns (ClaimsData) {
    return ClaimsData(contracts[uint(ID.CD)]);
  }

  function claimsReward() internal view returns (ClaimsReward) {
    return ClaimsReward(contracts[uint(ID.CR)]);
  }

  function quotationData() internal view returns (QuotationData) {
    return QuotationData(contracts[uint(ID.QD)]);
  }

  function tokenController() internal view returns (TokenController) {
    return TokenController(contracts[uint(ID.TC)]);
  }

  function memberRoles() internal view returns (MemberRoles) {
    return MemberRoles(contracts[uint(ID.MR)]);
  }

  function pool() internal view returns (Pool) {
    return Pool(contracts[uint(ID.P1)]);
  }

  function pooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(contracts[uint(ID.PS)]);
  }

  function changeDependentContractAddress() external {
    INXMMaster master = INXMMaster(master);
    contracts[uint(ID.CD)] = master.getLatestAddress("CD");
    contracts[uint(ID.CR)] = master.getLatestAddress("CR");
    contracts[uint(ID.QD)] = master.getLatestAddress("QD");
    contracts[uint(ID.TC)] = master.getLatestAddress("TC");
    contracts[uint(ID.MR)] = master.getLatestAddress("MR");
    contracts[uint(ID.P1)] = master.getLatestAddress("P1");
    contracts[uint(ID.PS)] = master.getLatestAddress("PS");
  }

}
