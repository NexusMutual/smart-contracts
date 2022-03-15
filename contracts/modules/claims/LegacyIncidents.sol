// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/ILegacyClaimsData.sol";
import "../../interfaces/ILegacyClaimsReward.sol";
import "../../interfaces/ILegacyIncidents.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
//import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";

contract LegacyIncidents is ILegacyIncidents, MasterAware {
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
    uint abRole = uint(IMemberRoles.Role.AdvisoryBoard);
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

  function pushBurns(address productId, uint maxIterations) external {

    uint burnAmount = accumulatedBurn[productId];
    delete accumulatedBurn[productId];

    require(burnAmount > 0, "Incidents: No burns to push");
    require(maxIterations >= 30, "Incidents: Pass at least 30 iterations");

    //IPooledStaking ps = pooledStaking();
    //ps.pushBurn(productId, burnAmount);
    //ps.processPendingActions(maxIterations);
  }

  function withdrawAsset(address asset, address destination, uint amount) external onlyGovernance {
    IERC20 token = IERC20(asset);
    uint balance = token.balanceOf(address(this));
    uint transferAmount = amount > balance ? balance : amount;
    token.safeTransfer(destination, transferAmount);
  }

  function _sendPayoutAndPushBurn(
    address /*productId*/,
    address payable /*coverOwner*/,
    uint /*coveredTokenAmount*/,
    address /*coverAsset*/,
    uint /*payoutAmount*/
  ) internal pure {
    revert("Migrate to v2");
  }

  function claimsData() internal view returns (ILegacyClaimsData) {
    return ILegacyClaimsData(internalContracts[uint(ID.CD)]);
  }

  function claimsReward() internal view returns (ILegacyClaimsReward) {
    return ILegacyClaimsReward(internalContracts[uint(ID.CR)]);
  }

  function quotationData() internal view returns (IQuotationData) {
    return IQuotationData(internalContracts[uint(ID.QD)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  //function pooledStaking() internal view returns (IPooledStaking) {
    //return IPooledStaking(internalContracts[uint(ID.PS)]);
  //}

  function mcr() internal view returns (IMCR) {
    return IMCR(internalContracts[uint(ID.MC)]);
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
