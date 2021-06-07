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

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IGateway.sol";

contract GatewayMock is IGateway {
  using SafeERC20 for IERC20;

  uint lastCoverId = 0;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  struct Cover {
    address owner;
    address contractAddress;
    address coverAsset;
    uint sumAssured;
    uint16 coverPeriod;
    uint8 coverType;
    bytes data;
    uint topUp;
  }

  mapping (uint => Cover) public covers;

  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    uint8 coverType,
    bytes calldata data
  ) external payable override returns (uint) {
    uint coverId = ++lastCoverId;
    covers[coverId].owner = msg.sender;
    covers[coverId].contractAddress = contractAddress;
    covers[coverId].coverAsset = coverAsset;
    covers[coverId].sumAssured = sumAssured;
    covers[coverId].coverPeriod = coverPeriod;
    covers[coverId].coverType = coverType;
    covers[coverId].data = data;
    return coverId;
  }

  function getCoverPrice (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    uint8 coverType,
    bytes calldata data
  ) external view override returns (uint coverPrice) {
    (
    coverPrice
    ) = abi.decode(data, (uint));
    coverPrice = coverPrice - 1; // substracts a small amount to be sent back
  }

  function submitClaim(uint coverId, bytes calldata data) external override returns (uint) {
    revert("Unsupported");
  }

  function claimTokens(uint coverId, uint incidentId, uint coveredTokenAmount, address coverAsset)
  external override returns (uint claimId, uint payoutAmount, address payoutToken) {
    revert("Unsupported");
  }

  function getClaimCoverId(uint claimId) external view override returns (uint) {
    revert("Unsupported");
  }

  function getPayoutOutcome(uint claimId) external view override returns (ClaimStatus, uint, address) {
    revert("Unsupported");
  }

  function getCover(uint coverId)
  external
  view
  override
  returns (
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil,
    address contractAddress,
    address coverAsset,
    uint premiumInNXM,
    address memberAddress
  ) {
    revert("Unsupported");
  }

  function executeCoverAction(uint coverId, uint8 action, bytes calldata data)
  external
  payable
  override
  returns (bytes memory, uint)
  {
    require(covers[coverId].owner == msg.sender, "CoverMock: Not owner of cover");

    if (action == 0) {
      require(covers[coverId].coverAsset == ETH, "Cover is not an ETH cover");
      uint topUpValue = abi.decode(data, (uint));
      require(msg.value >= topUpValue, "msg.value < topUpValue");
      covers[coverId].topUp += topUpValue;
      uint remainder = msg.value - topUpValue;
      (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
      require(ok, "CoverMock: Returning ETH remainder to sender failed.");
      return (abi.encode(covers[coverId].topUp), topUpValue);
    } else if (action == 1) {
      uint topUpValue = abi.decode(data, (uint));
      IERC20 token = IERC20(covers[coverId].coverAsset);
      token.safeTransferFrom(msg.sender, address(this), topUpValue);
      covers[coverId].topUp += topUpValue;
      return (abi.encode(covers[coverId].topUp), topUpValue);
    }
    revert("CoverMock: Unknown action");
  }

  function switchMembership(address _newAddress) external payable override {
    revert("Unsupported");
  }
}
