// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IERC20Detailed.sol";

interface ICowSettlement {

  struct GPv2TradeData {
    uint256 sellTokenIndex;
    uint256 buyTokenIndex;
    address receiver;
    uint256 sellAmount;
    uint256 buyAmount;
    uint32 validTo;
    bytes32 appData;
    uint256 feeAmount;
    uint256 flags;
    uint256 executedAmount;
    bytes signature;
  }

  struct GPv2InteractionData {
    address target;
    uint256 value;
    bytes callData;
  }

  function setPreSignature(bytes calldata orderUid, bool signed) external;
  
  function invalidateOrder(bytes calldata orderUid) external; 

  function filledAmount(bytes calldata orderUid) external view returns (uint256);

  function vaultRelayer() external view returns (address);

  function domainSeparator() external view returns (bytes32);

  function settle(
    IERC20Detailed[] calldata tokens,
    uint256[] calldata clearingPrices,
    GPv2TradeData[] calldata trades,
    GPv2InteractionData[][3] calldata interactions
  ) external;

  function preSignature(bytes memory) external returns (uint);
}
