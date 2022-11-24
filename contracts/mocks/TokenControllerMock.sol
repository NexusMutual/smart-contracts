// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../abstract/MasterAwareV2.sol";
import "../interfaces/INXMToken.sol";

interface ICover {
  function stakingPool(uint poolId) external view returns (address);
}

contract TokenControllerMock is MasterAwareV2 {

  struct StakingPoolNXMBalances {
    uint128 rewards;
    uint128 deposits;
  }

  address public addToWhitelistLastCalledWtih;
  address public removeFromWhitelistLastCalledWtih;

  mapping(uint => StakingPoolNXMBalances) public stakingPoolNXMBalances;

  function mint(address _member, uint256 _amount) public onlyInternal {
    token().mint(_member, _amount);
  }

  function burnFrom(address _of, uint amount) public onlyInternal returns (bool) {
    return token().burnFrom(_of, amount);
  }

  function addToWhitelist(address _member) public onlyInternal {
    addToWhitelistLastCalledWtih = _member;
  }

  function removeFromWhitelist(address _member) public onlyInternal {
    removeFromWhitelistLastCalledWtih = _member;
  }

  /* ========== DEPENDENCIES ========== */

  function token() public view returns (INXMToken) {
    return INXMToken(internalContracts[uint(ID.TK)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function changeDependentContractAddress() public {
    internalContracts[uint(ID.TK)] = payable(master.tokenAddress());
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
  }

  function operatorTransfer(address _from, address _to, uint _value) onlyInternal external returns (bool) {
    require(msg.sender == master.getLatestAddress("PS") || msg.sender == master.getLatestAddress("CO"),
      "Call is only allowed from PooledStaking or Cover address");
    require(token().operatorTransfer(_from, _value), "Operator transfer failed");
    require(token().transfer(_to, _value), "Internal transfer failed");
    return true;
  }

  function mintStakingPoolNXMRewards(uint amount, uint poolId) external {

    mint(address(this), amount);
    stakingPoolNXMBalances[poolId].rewards += uint128(amount);
  }

  function burnStakingPoolNXMRewards(uint amount, uint poolId) external {

    burnFrom(address(this), amount);
    stakingPoolNXMBalances[poolId].rewards -= uint128(amount);
  }

  function setContractAddresses(address payable coverAddr, address payable tokenAddr) public {
    internalContracts[uint(ID.TK)] = tokenAddr;
    internalContracts[uint(ID.CO)] = coverAddr;
  }

  function depositStakedNXM(address from, uint amount, uint poolId) external {
    require(msg.sender == address(cover().stakingPool(poolId)), "TokenController: msg.sender not staking pool");

    stakingPoolNXMBalances[poolId].deposits += uint128(amount);
    token().operatorTransfer(from, amount);
  }

  function withdrawNXMStakeAndRewards(address to, uint stakeToWithdraw, uint rewardsToWithdraw, uint poolId) external {}

    /* unused functions */

  modifier unused {
    require(false, "Unexpected TokenControllerMock call");
    _;
  }

  function burnLockedTokens(address, bytes32, uint256) unused external {}

  function tokensLocked(address, bytes32) unused external view returns (uint256) {}

  function releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) unused external {}
}
