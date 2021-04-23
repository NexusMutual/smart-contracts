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
import "../capital/PoolData.sol";
import "../claims/ClaimsReward.sol";
import "../governance/MemberRoles.sol";
import "../token/TokenController.sol";
import "../token/TokenData.sol";
import "../token/TokenFunctions.sol";
import "./QuotationData.sol";

contract Quotation is Iupgradable {
  using SafeMath for uint;

  TokenFunctions public tf;
  TokenController public tc;
  TokenData public td;
  Pool public pool;
  PoolData public pd;
  QuotationData public qd;
  MCR public m1;
  MemberRoles public mr;
  ClaimsReward public cr;

  bool internal locked;

  event RefundEvent(address indexed user, bool indexed status, uint holdedCoverID, bytes32 reason);

  modifier noReentrancy() {
    require(!locked, "Reentrant call.");
    locked = true;
    _;
    locked = false;
  }

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public onlyInternal {
    m1 = MCR(ms.getLatestAddress("MC"));
    tf = TokenFunctions(ms.getLatestAddress("TF"));
    tc = TokenController(ms.getLatestAddress("TC"));
    td = TokenData(ms.getLatestAddress("TD"));
    qd = QuotationData(ms.getLatestAddress("QD"));
    pd = PoolData(ms.getLatestAddress("PD"));
    mr = MemberRoles(ms.getLatestAddress("MR"));
    cr = ClaimsReward(ms.getLatestAddress("CR"));
    pool = Pool(ms.getLatestAddress("P1"));
  }

  // solhint-disable-next-line no-empty-blocks
  function sendEther() public payable {}

  /**
   * @dev Expires a cover after a set period of time and changes the status of the cover
   * @dev Reduces the total and contract sum assured
   * @param coverId Cover Id.
   */
  function expireCover(uint coverId) external {

    uint expirationDate = qd.getValidityOfCover(coverId);
    require(expirationDate < now, "Quotation: cover is not due to expire");

    uint coverStatus = qd.getCoverStatusNo(coverId);
    require(coverStatus != uint(QuotationData.CoverStatus.CoverExpired), "Quotation: cover already expired");

    (/* claim count */, bool hasOpenClaim, /* accepted */) = tc.coverInfo(coverId);
    require(!hasOpenClaim, "Quotation: cover has an open claim");

    if (coverStatus != uint(QuotationData.CoverStatus.ClaimAccepted)) {
      (,, address contractAddress, bytes4 currency, uint amount,) = qd.getCoverDetailsByCoverID1(coverId);
      qd.subFromTotalSumAssured(currency, amount);
      qd.subFromTotalSumAssuredSC(contractAddress, currency, amount);
    }

    qd.changeCoverStatusNo(coverId, uint8(QuotationData.CoverStatus.CoverExpired));
  }

  function withdrawCoverNote(address coverOwner, uint[] calldata coverIds, uint[] calldata reasonIndexes) external {

    uint gracePeriod = tc.claimSubmissionGracePeriod();

    for (uint i = 0; i < coverIds.length; i++) {
      uint expirationDate = qd.getValidityOfCover(coverIds[i]);
      require(expirationDate.add(gracePeriod) < now, "Quotation: cannot withdraw before grace period expiration");
    }

    tc.withdrawCoverNote(coverOwner, coverIds, reasonIndexes);
  }

  function getWithdrawableCoverNoteCoverIds(
    address coverOwner
  ) public view returns (
    uint[] memory expiredCoverIds,
    bytes32[] memory lockReasons
  ) {

    uint[] memory coverIds = qd.getAllCoversOfUser(coverOwner);
    uint[] memory expiredIdsQueue = new uint[](coverIds.length);
    uint gracePeriod = tc.claimSubmissionGracePeriod();
    uint expiredQueueLength = 0;

    for (uint i = 0; i < coverIds.length; i++) {

      uint coverExpirationDate = qd.getValidityOfCover(coverIds[i]);
      uint gracePeriodExpirationDate = coverExpirationDate.add(gracePeriod);
      (/* claimCount */, bool hasOpenClaim, /* hasAcceptedClaim */) = tc.coverInfo(coverIds[i]);

      if (!hasOpenClaim && gracePeriodExpirationDate < now) {
        expiredIdsQueue[expiredQueueLength] = coverIds[i];
        expiredQueueLength++;
      }
    }

    expiredCoverIds = new uint[](expiredQueueLength);
    lockReasons = new bytes32[](expiredQueueLength);

    for (uint i = 0; i < expiredQueueLength; i++) {
      expiredCoverIds[i] = expiredIdsQueue[i];
      lockReasons[i] = keccak256(abi.encodePacked("CN", coverOwner, expiredIdsQueue[i]));
    }
  }

  function getWithdrawableCoverNotesAmount(address coverOwner) external view returns (uint) {

    uint withdrawableAmount;
    bytes32[] memory lockReasons;
    (/*expiredCoverIds*/, lockReasons) = getWithdrawableCoverNoteCoverIds(coverOwner);

    for (uint i = 0; i < lockReasons.length; i++) {
      uint coverNoteAmount = tc.tokensLocked(coverOwner, lockReasons[i]);
      withdrawableAmount = withdrawableAmount.add(coverNoteAmount);
    }

    return withdrawableAmount;
  }

  /**
   * @dev Makes Cover funded via NXM tokens.
   * @param smartCAdd Smart Contract Address
   */
  function makeCoverUsingNXMTokens(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 coverCurr,
    address smartCAdd,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  )
  public
  isMemberAndcheckPause
  {

    tc.burnFrom(msg.sender, coverDetails[2]); // need burn allowance
    _verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s, true);
  }

  /**
   * @dev Verifies cover details signed off chain.
   * @param from address of funder.
   * @param scAddress Smart Contract Address
   */
  function verifyCoverDetails(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  )
  public
  onlyInternal
  {
    _verifyCoverDetails(
      from,
      scAddress,
      coverCurr,
      coverDetails,
      coverPeriod,
      _v,
      _r,
      _s,
      false
    );
  }

  /**
   * @dev Verifies signature.
   * @param coverDetails details related to cover.
   * @param coverPeriod validity of cover.
   * @param smaratCA smarat contract address.
   * @param _v argument from vrs hash.
   * @param _r argument from vrs hash.
   * @param _s argument from vrs hash.
   */
  function verifySign(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 curr,
    address smaratCA,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  )
  public
  view
  returns (bool)
  {
    require(smaratCA != address(0));
    require(pd.capReached() == 1, "Can not buy cover until cap reached for 1st time");
    bytes32 hash = getOrderHash(coverDetails, coverPeriod, curr, smaratCA);
    return isValidSignature(hash, _v, _r, _s);
  }

  /**
   * @dev Gets order hash for given cover details.
   * @param coverDetails details realted to cover.
   * @param coverPeriod validity of cover.
   * @param smaratCA smarat contract address.
   */
  function getOrderHash(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 curr,
    address smaratCA
  )
  public
  view
  returns (bytes32)
  {
    return keccak256(
      abi.encodePacked(
        coverDetails[0],
        curr, coverPeriod,
        smaratCA,
        coverDetails[1],
        coverDetails[2],
        coverDetails[3],
        coverDetails[4],
        address(this)
      )
    );
  }

  /**
   * @dev Verifies signature.
   * @param hash order hash
   * @param v argument from vrs hash.
   * @param r argument from vrs hash.
   * @param s argument from vrs hash.
   */
  function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) public view returns (bool) {
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, hash));
    address a = ecrecover(prefixedHash, v, r, s);
    return (a == qd.getAuthQuoteEngine());
  }

  /**
   * @dev Creates cover of the quotation, changes the status of the quotation ,
   * updates the total sum assured and locks the tokens of the cover against a quote.
   * @param from Quote member Ethereum address.
   */
  function _makeCover(//solhint-disable-line
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod
  )
  internal
  {
    uint cid = qd.getCoverLength();

    qd.addCover(
      coverPeriod,
      coverDetails[0],
      from,
      coverCurr,
      scAddress,
      coverDetails[1],
      coverDetails[2]
    );

    uint coverNoteAmount = coverDetails[2].mul(qd.tokensRetained()).div(100);
    uint gracePeriod = tc.claimSubmissionGracePeriod();
    uint claimSubmissionPeriod = uint(coverPeriod).mul(1 days).add(gracePeriod);
    bytes32 reason = keccak256(abi.encodePacked("CN", from, cid));

    td.setDepositCNAmount(cid, coverNoteAmount);
    tc.mintCoverNote(from, reason, coverNoteAmount, claimSubmissionPeriod);

    qd.addInTotalSumAssured(coverCurr, coverDetails[0]);
    qd.addInTotalSumAssuredSC(scAddress, coverCurr, coverDetails[0]);

    tf.pushStakerRewards(scAddress, coverDetails[2]);
  }

  /**
   * @dev Makes a cover.
   * @param from address of funder.
   * @param scAddress Smart Contract Address
   */
  function _verifyCoverDetails(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s,
    bool isNXM
  ) internal {
    require(coverDetails[3] > now);
    require(!qd.timestampRepeated(coverDetails[4]));
    qd.setTimestampRepeated(coverDetails[4]);
    require(coverPeriod >= 30 && coverPeriod <= 365, "Quotation: Cover period out of bounds");

    address asset = cr.getCurrencyAssetAddress(coverCurr);
    if (coverCurr != "ETH" && !isNXM) {
      pool.transferAssetFrom(asset, from, coverDetails[1]);
    }

    require(verifySign(coverDetails, coverPeriod, coverCurr, scAddress, _v, _r, _s));
    _makeCover(from, scAddress, coverCurr, coverDetails, coverPeriod);
  }

  function createCover(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public onlyInternal {
    require(coverDetails[3] > now, "Quotation: quote is expired");
    require(!qd.timestampRepeated(coverDetails[4]), "Quotation: quote already used");
    qd.setTimestampRepeated(coverDetails[4]);
    require(coverPeriod >= 30 && coverPeriod <= 365, "Quotation: Cover period out of bounds");

    require(verifySign(coverDetails, coverPeriod, coverCurr, scAddress, _v, _r, _s), "Quotation: signature mismatch");
    _makeCover(from, scAddress, coverCurr, coverDetails, coverPeriod);
  }

  // referenced in master, keeping for now
  // solhint-disable-next-line no-empty-blocks
  function transferAssetsToNewContract(address) external {}

  function freeUpHeldCovers() external noReentrancy {

    IERC20 dai = IERC20(cr.getCurrencyAssetAddress("DAI"));
    uint membershipFee = td.joiningFee();
    uint lastCoverId = 106;

    for (uint id = 1; id <= lastCoverId; id++) {

      if (qd.holdedCoverIDStatus(id) != uint(QuotationData.HCIDStatus.kycPending)) {
        continue;
      }

      (/*id*/, /*sc*/, bytes4 currency, /*period*/) = qd.getHoldedCoverDetailsByID1(id);
      (/*id*/, address payable userAddress, uint[] memory coverDetails) = qd.getHoldedCoverDetailsByID2(id);

      uint refundedETH;
      uint coverPremium = coverDetails[1];

      if (qd.refundEligible(userAddress)) {
        qd.setRefundEligible(userAddress, false);
        refundedETH = refundedETH.add(membershipFee);
      }

      qd.setHoldedCoverIDStatus(id, uint(QuotationData.HCIDStatus.kycFailedOrRefunded));

      if (currency == "ETH") {
        refundedETH = refundedETH.add(coverPremium);
      } else {
        require(dai.transfer(userAddress, coverPremium), "Quotation: DAI refund transfer failed");
      }

      userAddress.transfer(refundedETH);
    }
  }
}
