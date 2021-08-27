
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "../../interfaces/ICover.sol";


contract Cover is ICover, ERC721 {

  Cover[] public override covers;

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] calldata stakingPools
  ) external override returns (uint /*coverId*/) {
    return 0;
  }

  function createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint96 amount,
    uint32 period,
    StakingPool[] calldata stakingPools
  ) external override returns (uint /*coverId*/) {

    return 0;
  }

  function extendCover(
    uint coverId,
    uint duration,
    uint amount,
    uint maxPrice
  ) external returns (uint) {
    return 0;
  }

  function incrementDeniedClaims(uint coverId) external override {
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external override {

  }
}
