// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/StakingProductsGeneric.sol";

contract TCMockStakingPool is StakingProductsGeneric {
  uint public calls;
  mapping(uint => uint) public withdrawCalledWithTokenId;
  mapping(uint => bool) public withdrawCalledWithStake;
  mapping(uint => bool) public withdrawCalledWithRewards;
  mapping(uint => uint[]) public withdrawCalledWithTrancheIds;

  function withdraw(
    uint tokenId,
    bool withdrawStake,
    bool withdrawRewards,
    uint[] memory trancheIds
  ) external returns (uint /* withdrawnStake */, uint /* withdrawnRewards*/) {
    calls++;
    withdrawCalledWithTokenId[calls] = tokenId;
    withdrawCalledWithStake[calls] = withdrawStake;
    withdrawCalledWithRewards[calls] = withdrawRewards;
    withdrawCalledWithTrancheIds[calls] = trancheIds;

    return (0, 0);
  }

  function withdrawCalledWith(uint callId) external view returns (uint, bool, bool, uint[] memory) {
    return (
      withdrawCalledWithTokenId[callId],
      withdrawCalledWithStake[callId],
      withdrawCalledWithRewards[callId],
      withdrawCalledWithTrancheIds[callId]
    );
  }
}
