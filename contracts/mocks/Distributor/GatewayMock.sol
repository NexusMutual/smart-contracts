// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IGateway.sol";
import "./CoverBuyer.sol";

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
    CoverType coverType;
    bytes data;
    uint topUp;
  }

  mapping (uint => Cover) public covers;

  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    CoverType coverType,
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
    address,
    address,
    uint,
    uint16,
    CoverType,
    bytes calldata data
  ) external pure override returns (uint coverPrice) {
    (
    coverPrice
    ) = abi.decode(data, (uint));
    coverPrice = coverPrice - 1; // substracts a small amount to be sent back
  }

  function submitClaim(uint, bytes calldata) external pure override returns (uint) {
    revert("Unsupported");
  }

  function claimTokens(uint, uint, uint, address)
  external pure override returns (uint, uint, address) {
    revert("Unsupported");
  }

  function getClaimCoverId(uint) external pure override returns (uint) {
    revert("Unsupported");
  }

  function getPayoutOutcome(uint) external pure override returns (ClaimStatus, uint, address) {
    revert("Unsupported");
  }

  function getCover(uint)
  external
  pure
  override
  returns (
    uint8,
    uint,
    uint16,
    uint,
    address,
    address,
    uint,
    address
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

  function switchMembership(address) external override {
    revert("Unsupported");
  }
}
