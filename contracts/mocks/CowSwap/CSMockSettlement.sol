// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8.9;

import './CSMockVaultRelayer.sol';
import '../../external/cow/GPv2Order.sol';

contract CSMockSettlement {
  CSMockVaultRelayer public immutable vaultRelayer;
  mapping(bytes => uint256) public filledAmount;

  mapping(bytes => bool) public presignatures;

  constructor(address _vault) {
    vaultRelayer = CSMockVaultRelayer(_vault);
  }

  function setPreSignature(bytes memory orderUID, bool signed) external {
    presignatures[orderUID] = signed;
  }

  function fill(
    GPv2Order.Data calldata order,
    bytes memory orderUID,
    uint256 sellAmount,
    uint256 feeAmount,
    uint256 buyAmount
  ) public {
    require(presignatures[orderUID], 'not presigned');
    filledAmount[orderUID] += sellAmount;
    vaultRelayer.transfer(order.sellToken, order.receiver, address(vaultRelayer), sellAmount + feeAmount);
    vaultRelayer.transfer(order.buyToken, address(vaultRelayer), order.receiver, buyAmount);
  }
}
