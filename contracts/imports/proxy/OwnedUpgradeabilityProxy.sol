pragma solidity 0.5.7;

import './UpgradeabilityProxy.sol';

/**
 * @title OwnedUpgradeabilityProxy
 * @dev This contract combines an upgradeability proxy with basic authorization control functionalities
 */
contract OwnedUpgradeabilityProxy is UpgradeabilityProxy {
  /**
  * @dev Event to show ownership has been transferred
  * @param previousOwner representing the address of the previous owner
  * @param newOwner representing the address of the new owner
  */
  event ProxyOwnershipTransferred(address previousOwner, address newOwner);

  // Storage position of the owner of the contract
  bytes32 private constant proxyOwnerPosition = keccak256("org.govblocks.proxy.owner");

  /**
  * @dev the constructor sets the original owner of the contract to the sender account.
  */
  constructor(address _implementation) public {
    _setUpgradeabilityOwner(msg.sender);
    _upgradeTo(_implementation);
  }

  /**
  * @dev Throws if called by any account other than the owner.
  */
  modifier onlyProxyOwner() {
    require(msg.sender == proxyOwner());
    _;
  }

  /**
   * @dev Tells the address of the owner
   * @return the address of the owner
   */
  function proxyOwner() public view returns (address owner) {
    bytes32 position = proxyOwnerPosition;
    assembly {
      owner := sload(position)
    }
  }

  /**
   * @dev Allows the current owner to transfer control of the contract to a newOwner.
   * @param _newOwner The address to transfer ownership to.
   */
  function transferProxyOwnership(address _newOwner) public onlyProxyOwner {
    require(_newOwner != address(0));
    _setUpgradeabilityOwner(_newOwner);
    emit ProxyOwnershipTransferred(proxyOwner(), _newOwner);
  }

  /**
   * @dev Allows the proxy owner to upgrade the current version of the proxy.
   * @param _implementation representing the address of the new implementation to be set.
   */
  function upgradeTo(address _implementation) public onlyProxyOwner {
    _upgradeTo(_implementation);
  }

  /**
   * @dev Allows the proxy owner to upgrade the current version of the proxy and call the new implementation
   * to initialize whatever is needed through a low level call.
   * @param _implementation representing the address of the new implementation to be set.
   * @param _data represents the msg.data to bet sent in the low level call. This parameter may include the function
   * signature of the implementation to be called with the needed payload
   */
  function upgradeToAndCall(address _implementation, bytes memory _data) payable public onlyProxyOwner {
    _upgradeTo(_implementation);
    require(address(this).call.value(msg.value)(_data));
  }

  /**
   * @dev Sets the address of the owner
   */
  function _setUpgradeabilityOwner(address _newProxyOwner) internal {
    bytes32 position = proxyOwnerPosition;
    assembly {
      sstore(position, _newProxyOwner)
    }
  }
}