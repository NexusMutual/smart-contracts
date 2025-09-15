// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/IGovernor.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IVotePower.sol";

/// @notice ERC20-like contract to be used in Snapshot voting
contract VotePower is IVotePower, RegistryAware {

  string constant public name = "NXM balance with delegations";
  string constant public symbol = "NXMD";
  uint8 constant public decimals = 18;

  IGovernor public immutable governor;
  INXMToken public immutable token;

  constructor(address _registry) RegistryAware(_registry) {
    governor = IGovernor(registry.getContractAddressByIndex(C_GOVERNOR));
    token = INXMToken(registry.getContractAddressByIndex(C_TOKEN));
  }

  function balanceOf(address member) public view returns (uint) {
    return governor.getVoteWeight(member);
  }

  function totalSupply() public view returns (uint) {
    return token.totalSupply();
  }

}
