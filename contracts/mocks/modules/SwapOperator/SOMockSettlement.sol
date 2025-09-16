// SPDX-License-Identifier: LGPL-3.0-or-later

pragma solidity ^0.8.28;

import './SOMockVaultRelayer.sol';
import '../../../external/cow/GPv2Order.sol';

contract SOMockSettlement {
  SOMockVaultRelayer public immutable vaultRelayer;
  mapping(bytes => uint256) public filledAmount;
  mapping(bytes => bool) public presignatures;
  bytes32 public immutable domainSeparator;

  bytes32 private constant DOMAIN_TYPE_HASH =
    keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  bytes32 private constant DOMAIN_NAME = keccak256('Gnosis Protocol');
  bytes32 private constant DOMAIN_VERSION = keccak256('v2');

  constructor(address _vault) {
    vaultRelayer = SOMockVaultRelayer(_vault);
    domainSeparator = keccak256(
      abi.encode(DOMAIN_TYPE_HASH, DOMAIN_NAME, DOMAIN_VERSION, block.chainid, address(this))
    );
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

  event InvalidateOrderCalledWith(bytes orderUID);

  function invalidateOrder(bytes calldata orderUid) external {
    filledAmount[orderUid] = type(uint256).max;
    emit InvalidateOrderCalledWith(orderUid);
  }
}
