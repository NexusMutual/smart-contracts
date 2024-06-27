// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;


import "../../../external/enzyme/IEnzymeV4Vault.sol";
import "../../../modules/token/external/ERC20.sol";
import "../../common/ERC20Detailed.sol";

contract SOMockEnzymeV4Vault is IEnzymeV4Vault, ERC20Detailed, ERC20 {

  address accessor;

  constructor(
    address _accessor,
    string memory name,
    string memory symbol,
    uint8 decimals
  ) ERC20Detailed(name, symbol, decimals) public {
    accessor = _accessor;
  }

  function getAccessor() external view returns (address) {
    return accessor;
  }

  function mint(address account, uint256 amount) public returns (bool) {
    _mint(account, amount);
    return true;
  }

  function burn(address account, uint256 amount) public returns (bool) {
    _burn(account, amount);
    return true;
  }

  function getOwner() public view returns (address) {
    return address(0);
  }


  function mintShares(address, uint256) external {
    revert("Unexpected SOMockEnzymeV4Vault call");
  }
}
