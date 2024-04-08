// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IQuotationData.sol";

contract QuotationDataGeneric is IQuotationData {

  address public authQuoteEngine;

  function stlp() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function stl() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function pm() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function minDays() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function tokensRetained() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function kycAuthAddress() external virtual view returns (address) {
    revert("Unsupported");
  }

  function refundEligible(address) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function holdedCoverIDStatus(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function timestampRepeated(uint) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function addInTotalSumAssuredSC(address, bytes4, uint) external virtual {
    revert("Unsupported");
  }

  function subFromTotalSumAssuredSC(address, bytes4, uint) external virtual {
    revert("Unsupported");
  }

  function subFromTotalSumAssured(bytes4, uint) external virtual {
    revert("Unsupported");
  }

  function addInTotalSumAssured(bytes4, uint) external virtual {
    revert("Unsupported");
  }

  function setTimestampRepeated(uint) external virtual {
    revert("Unsupported");
  }

  /// @dev Creates a blank new cover.
  function addCover(uint16, uint, address payable, bytes4, address, uint, uint) external virtual {
    revert("Unsupported");
  }


  function addHoldCover(address payable, address, bytes4, uint[] calldata, uint16) external virtual {
    revert("Unsupported");
  }

  function setRefundEligible(address, bool) external virtual {
    revert("Unsupported");
  }

  function setHoldedCoverIDStatus(uint, uint) external virtual {
    revert("Unsupported");
  }

  function setKycAuthAddress(address) external virtual {
    revert("Unsupported");
  }

  function changeAuthQuoteEngine(address) external virtual {
    revert("Unsupported");
  }

  function getUintParameters(bytes8) external virtual view returns (bytes8, uint) {
    revert("Unsupported");
  }

  function getProductDetails() external virtual view returns (uint, uint, uint, uint) {
    revert("Unsupported");
  }

  function getCoverLength() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getAuthQuoteEngine() external virtual view returns (address) {
    revert("Unsupported");
  }

  function getTotalSumAssured(bytes4) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getAllCoversOfUser(address) external virtual view returns (uint[] memory) {
    revert("Unsupported");
  }

  function getUserCoverLength(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getCoverStatusNo(uint) external virtual view returns (uint8) {
    revert("Unsupported");
  }

  function getCoverPeriod(uint) external virtual view returns (uint32) {
    revert("Unsupported");
  }

  function getCoverSumAssured(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getCurrencyOfCover(uint) external virtual view returns (bytes4) {
    revert("Unsupported");
  }

  function getValidityOfCover(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getscAddressOfCover(uint) external virtual view returns (uint, address) {
    revert("Unsupported");
  }

  function getCoverMemberAddress(uint) external virtual view returns (address payable) {
    revert("Unsupported");
  }

  function getCoverPremiumNXM(uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getCoverDetailsByCoverID1(uint) external virtual view returns (uint, address, address, bytes4, uint, uint) {
    revert("Unsupported");
  }

  function getCoverDetailsByCoverID2(uint) external virtual view returns (uint, uint8, uint, uint16, uint) {
    revert("Unsupported");
  }

  function getHoldedCoverDetailsByID1(uint) external virtual view returns (uint, address, bytes4, uint16) {
    revert("Unsupported");
  }

  function getUserHoldedCoverLength(address) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getUserHoldedCoverByIndex(address, uint) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function getHoldedCoverDetailsByID2(uint) external virtual view returns (uint, address payable, uint[] memory) {
    revert("Unsupported");
  }

  function getTotalSumAssuredSC(address, bytes4) external virtual view returns (uint) {
    revert("Unsupported");
  }

  function changeCoverStatusNo(uint, uint8) external virtual {
    revert("Unsupported");
  }

}
