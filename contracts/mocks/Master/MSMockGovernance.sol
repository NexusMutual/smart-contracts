import "../../abstract/MasterAware.sol";
import "../../interfaces/ITokenController.sol";


contract MSMockGovernance is MasterAware {
  ITokenController tc;
  constructor() public {
  }

  function changeDependentContractAddress() external {
    tc = ITokenController(master.getLatestAddress("TC"));
  }

  function upgradeMultipleContracts(
    bytes2[] memory _contractCodes,
    address payable[] memory newAddresses
  )
  public {
    master.upgradeMultipleContracts(_contractCodes, newAddresses);
  }

  function removeContracts(bytes2[] memory contractCodesToRemove) public {
    master.removeContracts(contractCodesToRemove);
  }
}
