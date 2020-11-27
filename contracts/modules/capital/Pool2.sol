pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../abstract/MasterAware.sol";

/**
 * @dev Send assets to Pool1
 */
contract Pool2 is MasterAware {

  constructor (address masterAddress) public {
    changeMasterAddress(masterAddress);
  }

  function upgradeInvestmentPool(address) external {
    // noop
  }

  function changeDependentContractAddress() external {
    // noop
  }

  /**
   * @dev Send assets to Pool1
   */
  function transferAssets(address[] calldata assets) external {

    address poolAddress = master.getLatestAddress("P1");

    for (uint i = 0; i < assets.length; i++) {
      IERC20 token = IERC20(assets[i]);
      uint balance = token.balanceOf(address(this));
      token.transfer(poolAddress, balance);
    }

    uint etherBalance = address(this).balance;

    if (address(this).balance > 0) {
      (bool ok, /* data */) = poolAddress.call.value(etherBalance)("");
      ok; // just ok
    }
  }

}
