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
import "../capital/MCR.sol";

contract Incidents is MasterAware {
  using SafeERC20 for IERC20;
  using SafeMath for uint;

  struct Incident {
    address productId;
    uint32 date;
    uint priceBefore;
  }

  // contract identifiers
  enum ID {CD, CR, QD, TC, MR, P1, PS, MC}

  mapping(uint => address payable) public internalContracts;

  Incident[] public incidents;

  // product id => underlying token (ex. yDAI -> DAI)
  mapping(address => address) public underlyingToken;

  // product id => covered token (ex. 0xc7ed.....1 -> yDAI)
  mapping(address => address) public coveredToken;

  // claim id => payout amount
  mapping(uint => uint) public claimPayout;

  // product id => accumulated burn amount
  mapping(address => uint) public accumulatedBurn;

  // burn ratio in bps, ex 2000 for 20%
  uint public BURN_RATIO;

  // burn ratio in bps
  uint public DEDUCTIBLE_RATIO;

  uint constant BASIS_PRECISION = 10000;

  event ProductAdded(
    address indexed productId,
    address indexed coveredToken,
    address indexed underlyingToken
  );

  event IncidentAdded(
    address indexed productId,
    uint incidentDate,
    uint priceBefore
  );

  modifier onlyAdvisoryBoard {
    uint abRole = uint(MemberRoles.Role.AdvisoryBoard);
    require(
      memberRoles().checkRole(msg.sender, abRole),
      "Incidents: Caller is not an advisory board member"
    );
    _;
  }

  function initialize() external {
    require(BURN_RATIO == 0, "Already initialized");
    BURN_RATIO = 2000;
    DEDUCTIBLE_RATIO = 9000;
  }

  function addProducts(
    address[] calldata _productIds,
    address[] calldata _coveredTokens,
    address[] calldata _underlyingTokens
  ) external onlyAdvisoryBoard {

    require(
      _productIds.length == _coveredTokens.length,
      "Incidents: Protocols and covered tokens lengths differ"
    );

    require(
      _productIds.length == _underlyingTokens.length,
      "Incidents: Protocols and underyling tokens lengths differ"
    );

    for (uint i = 0; i < _productIds.length; i++) {
      address id = _productIds[i];

      require(coveredToken[id] == address(0), "Incidents: covered token is already set");
      require(underlyingToken[id] == address(0), "Incidents: underlying token is already set");

      coveredToken[id] = _coveredTokens[i];
      underlyingToken[id] = _underlyingTokens[i];
      emit ProductAdded(id, _coveredTokens[i], _underlyingTokens[i]);
    }
  }

  function incidentCount() external view returns (uint) {
    return incidents.length;
  }

  function addIncident(
    address productId,
    uint incidentDate,
    uint priceBefore
  ) external onlyGovernance {
    address underlying = underlyingToken[productId];
    require(underlying != address(0), "Incidents: Unsupported product");

    Incident memory incident = Incident(productId, uint32(incidentDate), priceBefore);
    incidents.push(incident);

    emit IncidentAdded(productId, incidentDate, priceBefore);
  }

  function redeemPayoutForMember(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount,
    address member
  ) external onlyInternal returns (uint claimId, uint payoutAmount, address payoutToken) {
    (claimId, payoutAmount, payoutToken) = _redeemPayout(coverId, incidentId, coveredTokenAmount, member);
  }

  function redeemPayout(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount
  ) external returns (uint claimId, uint payoutAmount, address payoutToken) {
    (claimId, payoutAmount, payoutToken) = _redeemPayout(coverId, incidentId, coveredTokenAmount, msg.sender);
  }

  function _redeemPayout(
    uint coverId,
    uint incidentId,
    uint coveredTokenAmount,
    address coverOwner
  ) internal returns (uint claimId, uint payoutAmount, address coverAsset) {
    QuotationData qd = quotationData();
    Incident memory incident = incidents[incidentId];
    uint sumAssured;
    bytes4 currency;

    {
      address productId;
      address _coverOwner;

      (/* id */, _coverOwner, productId,
       currency, sumAssured, /* premiumNXM */
      ) = qd.getCoverDetailsByCoverID1(coverId);

      // check ownership and covered protocol
      require(coverOwner == _coverOwner, "Incidents: Not cover owner");
      require(productId == incident.productId, "Incidents: Bad incident id");
    }

    {
      uint coverPeriod = uint(qd.getCoverPeriod(coverId)).mul(1 days);
      uint coverExpirationDate = qd.getValidityOfCover(coverId);
      uint coverStartDate = coverExpirationDate.sub(coverPeriod);

      // check cover validity
      require(coverStartDate <= incident.date, "Incidents: Cover start date is after the incident");
      require(coverExpirationDate >= incident.date, "Incidents: Cover end date is before the incident");

      // check grace period
      uint gracePeriod = tokenController().claimSubmissionGracePeriod();
      require(coverExpirationDate.add(gracePeriod) >= block.timestamp, "Incidents: Grace period has expired");
    }

    {
      // assumes 18 decimals (eth & dai)
      uint decimalPrecision = 1e18;
      uint maxAmount;

      // sumAssured is currently stored without decimals
      uint coverAmount = sumAssured.mul(decimalPrecision);

      {
        // max amount check
        uint deductiblePriceBefore = incident.priceBefore.mul(DEDUCTIBLE_RATIO).div(BASIS_PRECISION);
        maxAmount = coverAmount.mul(decimalPrecision).div(deductiblePriceBefore);
        require(coveredTokenAmount <= maxAmount, "Incidents: Amount exceeds sum assured");
      }

      // payoutAmount = coveredTokenAmount / maxAmount * coverAmount
      //              = coveredTokenAmount * coverAmount / maxAmount
      payoutAmount = coveredTokenAmount.mul(coverAmount).div(maxAmount);
    }

    {
      TokenController tc = tokenController();
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

    coverAsset = claimsReward().getCurrencyAssetAddress(currency);

    _sendPayoutAndPushBurn(
      incident.productId,
      address(uint160(coverOwner)),
      coveredTokenAmount,
      coverAsset,
      payoutAmount
    );

    qd.subFromTotalSumAssured(currency, sumAssured);
    qd.subFromTotalSumAssuredSC(incident.productId, currency, sumAssured);

    mcr().updateMCRInternal(pool().getPoolValueInEth(), true);
  }

  function pushBurns(address productId, uint maxIterations) external {

    uint burnAmount = accumulatedBurn[productId];
    delete accumulatedBurn[productId];

    require(burnAmount > 0, "Incidents: No burns to push");
    require(maxIterations >= 30, "Incidents: Pass at least 30 iterations");

    IPooledStaking ps = pooledStaking();
    ps.pushBurn(productId, burnAmount);
    ps.processPendingActions(maxIterations);
  }

  function withdrawAsset(address asset, address destination, uint amount) external onlyGovernance {
    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferAmount = amount > balance ? balance : amount;
    token.safeTransfer(destination, transferAmount);
  }

  function _sendPayoutAndPushBurn(
    address productId,
    address payable coverOwner,
    uint coveredTokenAmount,
    address coverAsset,
    uint payoutAmount
  ) internal {

    address _coveredToken = coveredToken[productId];

    // pull depegged tokens
    IERC20(_coveredToken).safeTransferFrom(msg.sender, address(this), coveredTokenAmount);

    Pool p1 = pool();

    // send the payoutAmount
    {
      address payable payoutAddress = memberRoles().getClaimPayoutAddress(coverOwner);
      bool success = p1.sendClaimPayout(coverAsset, payoutAddress, payoutAmount);
      require(success, "Incidents: Payout failed");
    }

    {
      // burn
      uint decimalPrecision = 1e18;
      uint assetPerNxm = p1.getTokenPrice(coverAsset);
      uint maxBurnAmount = payoutAmount.mul(decimalPrecision).div(assetPerNxm);
      uint burnAmount = maxBurnAmount.mul(BURN_RATIO).div(BASIS_PRECISION);

      accumulatedBurn[productId] = accumulatedBurn[productId].add(burnAmount);
    }
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
    return IPooledStaking(internalContracts[uint(ID.PS)]);
  }

  function mcr() internal view returns (MCR) {
    return MCR(internalContracts[uint(ID.MC)]);
  }

  function updateUintParameters(bytes8 code, uint value) external onlyGovernance {

    if (code == "BURNRATE") {
      require(value <= BASIS_PRECISION, "Incidents: Burn ratio cannot exceed 10000");
      BURN_RATIO = value;
      return;
    }

    if (code == "DEDUCTIB") {
      require(value <= BASIS_PRECISION, "Incidents: Deductible ratio cannot exceed 10000");
      DEDUCTIBLE_RATIO = value;
      return;
    }

    revert("Incidents: Invalid parameter");
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
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
  }

}
