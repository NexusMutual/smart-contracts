import "@openzeppelin/contracts-v4/proxy/Proxy.sol";
import "../../interfaces/IStakingPoolBeacon.sol";

/**
 * @dev This contract implements a proxy that gets the implementation address for each call from a {UpgradeableBeacon}.
 *
 * The beacon address is stored as an immutable field.
 *
 * _Available since v3.4._
 */
contract MinimalBeaconProxy is Proxy {

  /**
   * @dev The beacon address.
   */
  address immutable public beacon;

  /**
   * @dev Initializes the proxy with `beacon`.
   *
   * Requirements:
   *
   * - `beacon` must be a contract with the interface {IBeacon}.
   */
  constructor(address _beacon) payable {
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
