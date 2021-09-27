
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "../../interfaces/ICover.sol";

contract CoveRNFT is ERC721 {

  ICover cover;
  constructor(string memory name_, string memory symbol_, address _cover) ERC721(name_, symbol_) {
    cover = ICover(cover);
  }

  function safeMint(address to, uint tokenId) external {
    require(msg.sender == address(cover), "CoverNFT: Not Cover module");
    _safeMint(to, tokenId);
  }
}
