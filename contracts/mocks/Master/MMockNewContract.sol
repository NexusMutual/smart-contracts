import "../../abstract/MasterAware.sol";
import "../../interfaces/ITokenController.sol";


contract MMockNewContract is MasterAware {
  ITokenController tc;
  constructor() public {
  }

  function changeDependentContractAddress() external {
    tc = ITokenController(master.getLatestAddress("TC"));
  }

  function mint(address _member, uint _amount) public {
    tc.mint(_member, _amount);
  }
}
