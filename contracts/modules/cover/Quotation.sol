// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/ILegacyClaimsReward.sol";
import "../../interfaces/ILegacyIncidents.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/IQuotation.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenData.sol";

contract Quotation is IQuotation, MasterAware, ReentrancyGuard {
  using SafeMath for uint;

  ILegacyClaimsReward public cr;
  IPool public pool;
  IPooledStaking public pooledStaking;
  IQuotationData public qd;
  ITokenController public tc;
  ITokenData public td;
  ILegacyIncidents public incidents;

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public onlyInternal {
    cr = ILegacyClaimsReward(master.getLatestAddress("CR"));
    pool = IPool(master.getLatestAddress("P1"));
    pooledStaking = IPooledStaking(master.getLatestAddress("PS"));
    qd = IQuotationData(master.getLatestAddress("QD"));
    tc = ITokenController(master.getLatestAddress("TC"));
    td = ITokenData(master.getLatestAddress("TD"));
    incidents = ILegacyIncidents(master.getLatestAddress("IC"));
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
    require(coverStatus != uint(IQuotationData.CoverStatus.CoverExpired), "Quotation: cover already expired");

    (/* claim count */, bool hasOpenClaim, /* accepted */) = tc.coverInfo(coverId);
    require(!hasOpenClaim, "Quotation: cover has an open claim");

    if (coverStatus != uint(IQuotationData.CoverStatus.ClaimAccepted)) {
      (,, address contractAddress, bytes4 currency, uint amount,) = qd.getCoverDetailsByCoverID1(coverId);
      qd.subFromTotalSumAssured(currency, amount);
      qd.subFromTotalSumAssuredSC(contractAddress, currency, amount);
    }

    qd.changeCoverStatusNo(coverId, uint8(IQuotationData.CoverStatus.CoverExpired));
  }

  function withdrawCoverNote(address coverOwner, uint[] calldata coverIds, uint[] calldata reasonIndexes) external {

    uint gracePeriod = 120; // hardcoded for now

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
    uint gracePeriod = 120; //hardcoded
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
    uint[] calldata coverDetails,
    uint16 coverPeriod,
    bytes4 coverCurr,
    address smartCAdd,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external onlyMember whenNotPaused {
    tc.burnFrom(msg.sender, coverDetails[2]); // needs allowance
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
  ) public onlyInternal {
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
   * @param contractAddress smart contract address.
   * @param _v argument from vrs hash.
   * @param _r argument from vrs hash.
   * @param _s argument from vrs hash.
   */
  function verifySignature(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 currency,
    address contractAddress,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public view returns (bool) {
    require(contractAddress != address(0));
    bytes32 hash = getOrderHash(coverDetails, coverPeriod, currency, contractAddress);
    return isValidSignature(hash, _v, _r, _s);
  }

  /**
   * @dev Gets order hash for given cover details.
   * @param coverDetails details realted to cover.
   * @param coverPeriod validity of cover.
   * @param contractAddress smart contract address.
   */
  function getOrderHash(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 currency,
    address contractAddress
  ) public view returns (bytes32) {
    return keccak256(
      abi.encodePacked(
        coverDetails[0],
        currency,
        coverPeriod,
        contractAddress,
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
    address contractAddress,
    bytes4 coverCurrency,
    uint[] memory coverDetails,
    uint16 coverPeriod
  ) internal {

    address underlyingToken = incidents.underlyingToken(contractAddress);

    if (underlyingToken != address(0)) {
      address coverAsset = cr.getCurrencyAssetAddress(coverCurrency);
      require(coverAsset == underlyingToken, "Quotation: Unsupported cover asset for this product");
    }

    uint cid = qd.getCoverLength();

    qd.addCover(
      coverPeriod,
      coverDetails[0],
      from,
      coverCurrency,
      contractAddress,
      coverDetails[1],
      coverDetails[2]
    );

    uint coverNoteAmount = coverDetails[2].mul(qd.tokensRetained()).div(100);

    uint gracePeriod = 120; // hardcoded
    uint claimSubmissionPeriod = uint(coverPeriod).mul(1 days).add(gracePeriod);
    bytes32 reason = keccak256(abi.encodePacked("CN", from, cid));

    // mint and lock cover note
    td.setDepositCNAmount(cid, coverNoteAmount);
    tc.mintCoverNote(from, reason, coverNoteAmount, claimSubmissionPeriod);

    qd.addInTotalSumAssured(coverCurrency, coverDetails[0]);
    qd.addInTotalSumAssuredSC(contractAddress, coverCurrency, coverDetails[0]);

    uint coverPremiumInNXM = coverDetails[2];
    uint stakersRewardPercentage = td.stakerCommissionPer();
    uint rewardValue = coverPremiumInNXM.mul(stakersRewardPercentage).div(100);
    pooledStaking.accumulateReward(contractAddress, rewardValue);
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

    require(coverDetails[3] > now, "Quotation: Quote has expired");
    require(coverPeriod >= 30 && coverPeriod <= 365, "Quotation: Cover period out of bounds");
    require(!qd.timestampRepeated(coverDetails[4]), "Quotation: Quote already used");
    qd.setTimestampRepeated(coverDetails[4]);

    address asset = cr.getCurrencyAssetAddress(coverCurr);
    if (coverCurr != "ETH" && !isNXM) {
      pool.transferAssetFrom(asset, from, coverDetails[1]);
    }

    require(verifySignature(coverDetails, coverPeriod, coverCurr, scAddress, _v, _r, _s), "Quotation: signature mismatch");
    _makeCover(from, scAddress, coverCurr, coverDetails, coverPeriod);
  }

  function createCover(
    address payable from,
    address scAddress,
    bytes4 currency,
    uint[] calldata coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external onlyInternal {

    require(coverDetails[3] > now, "Quotation: Quote has expired");
    require(coverPeriod >= 30 && coverPeriod <= 365, "Quotation: Cover period out of bounds");
    require(!qd.timestampRepeated(coverDetails[4]), "Quotation: Quote already used");
    qd.setTimestampRepeated(coverDetails[4]);

    require(verifySignature(coverDetails, coverPeriod, currency, scAddress, _v, _r, _s), "Quotation: signature mismatch");
    _makeCover(from, scAddress, currency, coverDetails, coverPeriod);
  }

  // referenced in master, keeping for now
  // solhint-disable-next-line no-empty-blocks
  function transferAssetsToNewContract(address) external pure {}

  function freeUpHeldCovers() external nonReentrant {

    IERC20 dai = IERC20(cr.getCurrencyAssetAddress("DAI"));
    uint membershipFee = td.joiningFee();
    uint lastCoverId = 106;

    for (uint id = 1; id <= lastCoverId; id++) {

      if (qd.holdedCoverIDStatus(id) != uint(IQuotationData.HCIDStatus.kycPending)) {
        continue;
      }

      (/*id*/, /*sc*/, bytes4 currency, /*period*/) = qd.getHoldedCoverDetailsByID1(id);
      (/*id*/, address payable userAddress, uint[] memory coverDetails) = qd.getHoldedCoverDetailsByID2(id);

      uint refundedETH = membershipFee;
      uint coverPremium = coverDetails[1];

      if (qd.refundEligible(userAddress)) {
        qd.setRefundEligible(userAddress, false);
      }

      qd.setHoldedCoverIDStatus(id, uint(IQuotationData.HCIDStatus.kycFailedOrRefunded));

      if (currency == "ETH") {
        refundedETH = refundedETH.add(coverPremium);
      } else {
        require(dai.transfer(userAddress, coverPremium), "Quotation: DAI refund transfer failed");
      }

      userAddress.transfer(refundedETH);
    }
  }
}
