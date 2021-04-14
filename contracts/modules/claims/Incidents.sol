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
    address productId;
    uint32 date;
    uint112 priceBefore;
    uint112 priceAfter;
  }

  // contract identifiers
  enum ID {CD, CR, QD, TC, MR, P1, PS}

  mapping(uint => address payable) public internalContracts;

  Incident[] public incidents;

  // TODO: forward support for multiple cover assets
  // protocol identifier/address => underlying token (ex. yDAI -> DAI)
  mapping(address => address) public underlyingToken;

  // protocol identifier/address => covered token
  mapping(address => address) public coveredToken;

  // claim id => payout amount
  mapping(uint => uint) public claimPayout;

  // product id => acumulated burn amount
  mapping(address => uint) public accumulatedBurn;

  event TokenSet(
    address indexed productId,
    address indexed coveredToken,
    address indexed underlyingToken
  );

  event IncidentAdded(
    address indexed productId,
    uint incidentDate,
    uint priceBefore,
    uint priceAfter
  );

  function setTokens(
    address[] calldata _productIds,
    address[] calldata _coveredTokens,
    address[] calldata _underlyingTokens
  ) external onlyGovernance {

    require(
      _productIds.length == _coveredTokens.length,
      "Incidents: protocols and covered tokens lengths differ"
    );

    require(
      _productIds.length == _underlyingTokens.length,
      "Incidents: protocols and underyling tokens lengths differ"
    );

    for (uint i = 0; i < _productIds.length; i++) {
      address id = _productIds[i];

      require(coveredToken[id] == address(0), "");
      require(underlyingToken[id] == address(0), "");

      coveredToken[id] = _coveredTokens[i];
      underlyingToken[id] = _underlyingTokens[i];
      emit TokenSet(id, _coveredTokens[i], _underlyingTokens[i]);
    }
  }

  function addIncident(
    address productId,
    uint incidentDate,
    uint priceBefore,
    uint priceAfter
  ) external onlyGovernance {

    require(priceBefore > priceAfter, "Incidents: No depeg");

    address underlying = underlyingToken[productId];
    require(underlying != address(0), "Incidents: Unsupported product");

    Incident memory incident = Incident(
      productId,
      uint32(incidentDate),
      uint112(priceBefore),
      uint112(priceAfter)
    );

    incidents.push(incident);

    emit IncidentAdded(productId, incidentDate, priceBefore, priceAfter);
  }

  function redeemPayout(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount
  ) external returns (uint claimId, uint payoutAmount) {

    QuotationData qd = quotationData();
    TokenController tc = tokenController();

    Incident memory incident = incidents[incidentId];
    address coverOwner;
    uint sumAssured;
    bytes4 currency;

    {
      address productId;
      uint coverStartDate;
      uint coverExpirationDate;

      (
      productId, coverOwner, coverStartDate,
      coverExpirationDate, sumAssured, currency
      ) = _getCoverDetails(qd, coverId);

      // check ownership and covered protocol
      require(msg.sender == coverOwner, "Incidents: Not cover owner");
      require(productId == incident.productId, "Incidents: Bad incident id");

      // check cover validity
      require(coverStartDate <= incident.date, "Incidents: Cover start date is before the incident");
      require(coverExpirationDate >= incident.date, "Incidents: Cover end date is after the incident");

      // check grace period
      uint gracePeriod = tc.claimSubmissionGracePeriod();
      require(coverExpirationDate.add(gracePeriod) >= block.timestamp, "Incidents: Grace period has expired");
    }

    {
      // assumes 18 decimals (eth & dai)
      uint decimalPrecision = 1e18;

      // sumAssured is currently stored without decimals
      uint coverAmount = sumAssured.mul(decimalPrecision);

      // max amount check
      uint maxAmount = coverAmount.mul(decimalPrecision).div(incident.priceBefore);
      require(coveredTokenAmount <= maxAmount, "Incidents: Amount exceeds sum assured");

      // coveredTokenAmount / maxAmount * coverAmount
      payoutAmount = coveredTokenAmount.mul(coverAmount).div(maxAmount);
    }

    {
      // mark cover as having a successful claim
      tc.markCoverClaimOpen(coverId);
      tc.markCoverClaimClosed(coverId, true);

      // create the claim
      ClaimsData cd = claimsData();
      claimId = cd.actualClaimLength();
      cd.addClaim(claimId, coverId, coverOwner, now);
      cd.callClaimEvent(coverId, coverOwner, claimId, now);
      cd.setClaimStatus(claimId, 14);
      qd.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.ClaimAccepted));

      claimPayout[claimId] = payoutAmount;
    }

    _sendPayoutAndPushBurn(incident.productId, address(uint160(coverOwner)), coveredTokenAmount, payoutAmount);

    qd.subFromTotalSumAssured(currency, sumAssured);
    qd.subFromTotalSumAssuredSC(incident.productId, currency, sumAssured);
  }

  function pushBurns(address productId, uint iterations) external {

    uint burnAmount = accumulatedBurn[productId];
    delete accumulatedBurn[productId];

    require(burnAmount > 0, "Incidents: No burns to push");
    require(iterations >= 30, "Incidents: Pass at least 30 iterations");

    IPooledStaking ps = pooledStaking();
    ps.pushBurn(productId, burnAmount);
    ps.processPendingActions(iterations);
  }

  function withdrawAsset(
    address asset,
    address destination,
    uint amount
  ) external onlyGovernance {
    IERC20(asset).safeTransfer(destination, amount);
  }

  function _getCoverDetails(QuotationData qd, uint coverId) internal view returns (
    address productId,
    address coverOwner,
    uint coverStartDate,
    uint coverExpirationDate,
    uint sumAssured,
    bytes4 currency
  ) {

    (
    /* id */, coverOwner, productId,
    currency, sumAssured, /* premiumNXM */
    ) = qd.getCoverDetailsByCoverID1(coverId);

    uint coverPeriod = uint(qd.getCoverPeriod(coverId)).mul(1 days);
    coverExpirationDate = qd.getValidityOfCover(coverId);
    coverStartDate = coverExpirationDate.sub(coverPeriod);
  }

  function _sendPayoutAndPushBurn(
    address productId,
    address payable coverOwner,
    uint coveredTokenAmount,
    uint payoutAmount
  ) internal {

    address _underlyingToken = underlyingToken[productId];
    address _coveredToken = coveredToken[productId];
    address payable payoutAddress = memberRoles().getClaimPayoutAddress(coverOwner);

    // // note: technically this check should have happened at cover purchase time
    // address coverCurrencyAddress = claimsReward().getCurrencyAssetAddress(currency);
    // require(coverCurrencyAddress == _underlyingToken, "Incidents: Cover asset != underlying asset");

    // pull depeged tokens
    IERC20(_coveredToken).safeTransferFrom(msg.sender, address(this), coveredTokenAmount);

    Pool p1 = pool();

    // send the payoutAmount
    bool success = p1.sendClaimPayout(_underlyingToken, payoutAddress, payoutAmount);
    require(success, "Incidents: Payout failed");

    // burn
    uint decimalPrecision = 1e18;
    uint assetPerNxm = p1.getTokenPrice(_underlyingToken);
    uint burnAmount = payoutAmount.mul(decimalPrecision).div(assetPerNxm);

    accumulatedBurn[productId] = accumulatedBurn[productId].add(burnAmount);
  }

  function claimsData() internal view returns (ClaimsData) {
    return ClaimsData(internalContracts[uint(ID.CD)]);
  }

  function claimsReward() internal view returns (ClaimsReward) {
    return ClaimsReward(internalContracts[uint(ID.CR)]);
  }

  function quotationData() internal view returns (QuotationData) {
    return QuotationData(internalContracts[uint(ID.QD)]);
  }

  function tokenController() internal view returns (TokenController) {
    return TokenController(internalContracts[uint(ID.TC)]);
  }

  function memberRoles() internal view returns (MemberRoles) {
    return MemberRoles(internalContracts[uint(ID.MR)]);
  }

  function pool() internal view returns (Pool) {
    return Pool(internalContracts[uint(ID.P1)]);
  }

  function pooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(contracts[uint(ID.PS)]);
  }

  function changeDependentContractAddress() external {
    INXMMaster master = INXMMaster(master);
    internalContracts[uint(ID.CD)] = master.getLatestAddress("CD");
    internalContracts[uint(ID.CR)] = master.getLatestAddress("CR");
    internalContracts[uint(ID.QD)] = master.getLatestAddress("QD");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.PS)] = master.getLatestAddress("PS");
  }

}
