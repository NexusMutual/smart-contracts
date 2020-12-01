pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../abstract/MasterAware.sol";

/**
 * @dev Send assets to Pool1
 */
contract Pool2 is MasterAware {

  IERC20 public dai;

  constructor (address masterAddress, address _dai) public {
    changeMasterAddress(masterAddress);
    dai = IERC20(_dai);
  }

  function sendEther() external payable {
    // noop
  }

  function upgradeInvestmentPool(address) external {
    // noop
  }

  // triggered after all contracts upgrade
  function changeDependentContractAddress() external {

    address poolAddress = master.getLatestAddress("P1");
    uint balance = dai.balanceOf(address(this));
    uint etherBalance = address(this).balance;

    // transfer dai
    require(dai.transfer(poolAddress, balance), "P2: failed to send DAI to P1");

    // transfer ether
    (bool ok, /* data */) = poolAddress.call.value(etherBalance)("");
    require(ok, "P2: failed to send ETH to P1");
  }

}
