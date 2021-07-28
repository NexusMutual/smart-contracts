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

  function updateOwnerParameters(bytes8 code, address payable val) public {
    master.updateOwnerParameters(code, val);
  }

  function addNewInternalContracts(
    bytes2[] memory _contractCodes,
    address payable[] memory newAddresses,
    uint[] memory _types
  )
  public
  {
    master.addNewInternalContracts(_contractCodes, newAddresses, _types);
  }
}
