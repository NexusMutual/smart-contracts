import "@openzeppelin/contracts-v4/proxy/Proxy.sol";
import "../../interfaces/IStakingPoolBeacon.sol";
import "hardhat/console.sol";

/**
 * @dev This contract implements a proxy that gets the implementation address for each call from a {UpgradeableBeacon}.
 *
 * The beacon address is stored as an immutable field.
 *
 */
contract MinimalBeaconProxy is Proxy {

  /**
   * @dev The beacon address.
   */
  address immutable public beacon;

  /**
   * @dev Initializes the proxy with `beacon`.
   *
   */
  constructor(address _beacon) {
    beacon = _beacon;
  }

  /**
   * @dev Returns the current beacon address.
   */
  function _beacon() internal view virtual returns (address) {
    return beacon;
  }

  /**
   * @dev Returns the current implementation address of the associated beacon.
   */
  function _implementation() internal view virtual override returns (address) {
    return IStakingPoolBeacon(beacon).stakingPoolImplementation();
  }
}
