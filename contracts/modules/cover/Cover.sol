/* Copyright (C) 2020 NexusMutual.io

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
import "../capital/MCR.sol";
import "../capital/Pool1.sol";
import "../capital/PoolData.sol";
import "../governance/MemberRoles.sol";
import "../token/TokenController.sol";
import "../token/TokenData.sol";
import "../token/TokenData.sol";
import "../capital/PoolData.sol";
import "../token/TokenFunctions.sol";
import "./QuotationData.sol";

contract Cover is MasterAware, Iupgradable {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  // contracts
  Quotation public quotation;
  NXMToken public nxmToken;
  TokenController public tokenController;
  QuotationData public quotationData;
  ClaimsData public claimsData;
  Claims public claims;
  MCR public mcr;
  Pool1 public pool;

  enum CoverType { SIGNED_QUOTE_CONTRACT_COVER }

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address public DAI;

  constructor (address masterAddress, address _daiAddress) public {
    changeMasterAddress(masterAddress);
    DAI = _daiAddress;
  }

  function changeDependentContractAddress() public {
    quotation = Quotation(ms.getLatestAddress("QT"));
    nxmToken = NXMToken(ms.getLatestAddress("QT"));
    tokenController = TokenController(ms.tokenAddress());
    quotationData = QuotationData(ms.getLatestAddress("QD"));
    claimsData = ClaimsData(ms.getLatestAddress("CD"));
    claims = Claims(ms.getLatestAddress("CL"));
    mcr = MCR(ms.getLatestAddress("MC"));
    pool = Pool1(ms.getLatestAddress("P1"));
  }

  function buyCover (
    address contractAddress,
    address coverAsset,
    uint coverAmount,
    uint16 coverPeriod,
    CoverType coverType,
    bytes calldata data
  ) external payable onlyMember whenNotPaused returns (uint) {

    // only 1 cover type supported at this time
    require(coverType == CoverType.SIGNED_QUOTE_CONTRACT_COVER, "Unsupported cover type");
    require(coverAmount % 1e18 == 0, "Only whole unit coverAmount supported");

    {
      (
      uint[] memory coverDetails,
      uint8 _v,
      bytes32 _r,
      bytes32 _s ) = getCoverDetails(coverAmount, data);

      require(msg.value == coverDetails[1], "Cover: ETH amount does not match premium");
      quotation.verifyCoverDetails(
        msg.sender,
        contractAddress,
        getCurrencyFromAssetAddress(coverAsset),
        coverDetails,
        coverPeriod, _v, _r, _s);
      
      sendCoverPremiumToPool(coverAsset, coverDetails[1]);
    }


    return quotationData.getCoverLength().sub(1);
  }

  function sendCoverPremiumToPool (
    address asset,
    uint premiumAmount
  ) internal returns (bool success) {

    if (asset == ETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool ok, /* data */) = address(pool).call.value(premiumAmount)("");
      require(ok, "Cover: Transfer to Pool failed");
    }

    IERC20 token = IERC20(asset);
    token.safeTransfer(address(pool), premiumAmount);
  }

  function getCoverDetails(uint coverAmount, bytes memory data) internal pure returns (uint[] memory, uint8, bytes32, bytes32) {
    (
    uint coverPrice,
    uint coverPriceNXM,
    uint generatedAt,
    uint expiresAt,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
    ) = abi.decode(data, (uint, uint, uint, uint, uint8, bytes32, bytes32));
    uint[] memory coverDetails = new uint[](5);
    coverDetails[0] = coverAmount.div(1e18); // convert from wei to units
    coverDetails[1] = coverPrice;
    coverDetails[2] = coverPriceNXM;
    coverDetails[3] = expiresAt;
    coverDetails[4] = generatedAt;
    return (coverDetails, _v, _r, _s);
  }

  function submitClaim(uint coverId, bytes calldata data) external returns (uint) {
    address qadd = quotationData.getCoverMemberAddress(coverId);
    require(qadd == msg.sender);
    uint8 cStatus;
    (, cStatus,,,) = quotationData.getCoverDetailsByCoverID2(coverId);
    require(cStatus != uint8(QuotationData.CoverStatus.ClaimSubmitted), "Claim already submitted");
    require(cStatus != uint8(QuotationData.CoverStatus.CoverExpired), "Cover already expired");
    if (ms.isPause() == false) {
      claims._addClaim(coverId, now, qadd);
    } else {
      claimsData.setClaimAtEmergencyPause(coverId, now, false);
      quotationData.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.Requested));
    }

    uint claimId = claimsData.actualClaimLength() - 1;
    return claimId;
  }

  function payoutIsCompleted(uint claimId) external view returns (bool) {
    uint256 status;
    (, status, , , ) = claims.getClaimbyIndex(claimId);
    return status == 14;
  }

  function getCover(
    uint coverId
  ) external view returns (
    uint cid,
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil
  ) {
    return quotationData.getCoverDetailsByCoverID2(coverId);
  }

  function getCurrencyFromAssetAddress(address asset) public view returns (bytes4) {

    if (asset == ETH) {
      return "ETH";
    }

    if (asset == DAI) {
      return "DAI";
    }

    revert("Cover: unknown asset");
  }
}
