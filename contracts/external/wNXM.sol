// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/INXMToken.sol";
import "../libraries/Math.sol";

/**
 * @dev Implementation of the wNXM token using solidity 0.8.x.
 * @dev The original (mainnet) wNXM contract is deployed at 0x0d438f3b5175bebc262bf23753c1e53d03432bde
 * @dev The original contract is not written nor maintained by Nexus Mutual.
 */
contract wNXM is ERC20Permit {
  using SafeERC20 for ERC20;

  INXMToken public NXM;

  modifier notwNXM(address recipient) {
    require(recipient != address(this), "wNXM: can not send to self");
    _;
  }

  constructor(INXMToken _nxm) ERC20("Wrapped NXM", "wNXM") ERC20Permit("Wrapped NXM") {
    NXM = _nxm;
  }

  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  ) internal override notwNXM(recipient) {
    super._transfer(sender, recipient, amount);
  }

  function wrap(uint256 _amount) external {
    require(NXM.transferFrom(msg.sender, address(this), _amount), "wNXM: transferFrom failed");
    _mint(msg.sender, _amount);
  }

  function unwrap(uint256 _amount) external {
    unwrapTo(msg.sender, _amount);
  }

  function unwrapTo(address _to, uint256 _amount) public notwNXM(_to) {
    _burn(msg.sender, _amount);
    require(NXM.transfer(_to, _amount), "wNXM: transfer failed");
  }

  function canWrap(address _owner, uint256 _amount) external view returns (
    bool success,
    string memory reason
  ){
    if (NXM.allowance(_owner, address(this)) < _amount) {
      return (false, "insufficient allowance");
    }

    if (NXM.balanceOf(_owner) < _amount) {
      return (false, "insufficient NXM balance");
    }

    if (NXM.isLockedForMV(_owner) > block.timestamp) {
      return (false, "NXM balance lockedForMv");
    }

    if (!NXM.whiteListed(address(this))) {
      return (false, "wNXM is not whitelisted");
    }

    return (true, "");
  }

  function canUnwrap(address _owner, address _recipient, uint256 _amount) external view returns (
    bool success,
    string memory reason
  ) {
    if (balanceOf(_owner) < _amount) {
      return (false, "insufficient wNXM balance");
    }

    if (!NXM.whiteListed(_recipient)) {
      return (false, "recipient is not whitelisted");
    }

    if (NXM.isLockedForMV(address(this)) > block.timestamp) {
      return (false, "wNXM is lockedForMv");
    }

    return (true, "");
  }

  /// @dev Method to claim junk and accidentally sent tokens
  function claimTokens(ERC20 _token, address payable _to, uint256 _balance) external {

    require(_to != address(0), "wNXM: can not send to zero address");

    if (_token == ERC20(address(NXM))) {
      uint256 surplusBalance = _token.balanceOf(address(this)) - totalSupply();
      require(surplusBalance > 0, "wNXM: there is no accidentally sent NXM");
      uint256 balance = _balance == 0 ? surplusBalance : Math.min(surplusBalance, _balance);
      _token.safeTransfer(_to, balance);
      return;
    }

    if (address(_token) == address(0)) {
      // for Ether
      uint256 totalBalance = address(this).balance;
      uint256 balance = _balance == 0 ? totalBalance : Math.min(totalBalance, _balance);
      _to.transfer(balance);
      return;
    }

    {
      // any other erc20
      uint256 totalBalance = _token.balanceOf(address(this));
      uint256 balance = _balance == 0 ? totalBalance : Math.min(totalBalance, _balance);
      require(balance > 0, "wNXM: trying to send 0 balance");
      _token.safeTransfer(_to, balance);
    }
  }
}
