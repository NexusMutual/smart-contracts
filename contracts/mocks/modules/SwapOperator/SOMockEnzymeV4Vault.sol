// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/ERC20.sol";
import "../../../external/enzyme/IEnzymeV4Vault.sol";

contract SOMockEnzymeV4Vault is IEnzymeV4Vault, ERC20 {

  constructor() ERC20("Enzyme Vault", "NXMTY") {}

  address internal accessor;

  // IEnzymeV4Vault

  function setAccessor(address _accessor) external {
    accessor = _accessor;
  }

  function getAccessor() external view returns (address) {
    return accessor;
  }

  function getOwner() external pure returns (address) {
    revert("Unexpected SOMockEnzymeV4Vault call");
  }

  function mintShares(address, uint) external pure {
    revert("Unexpected SOMockEnzymeV4Vault call");
  }

  // mock helpers

  function withdraw(ERC20 asset, address dst, uint amount) external {
    asset.transfer(dst, amount);
  }

  function mint(address account, uint amount) external {
    _mint(account, amount);
  }

  function burn(address account, uint amount) external {
    _burn(account, amount);
  }
}
