
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "../../interfaces/ICover.sol";

contract CoverNFT is ERC721 {

  ICover immutable public cover;
  constructor(string memory name_, string memory symbol_, address _cover) ERC721(name_, symbol_) {
    cover = ICover(_cover);
  }

  function safeMint(address to, uint tokenId) external {
    require(msg.sender == address(cover), "CoverNFT: Not Cover module");
    _safeMint(to, tokenId);
  }

  function isApprovedOrOwner(address spender, uint tokenId) external view returns (bool) {
    return _isApprovedOrOwner(spender, tokenId);
  }

  function burn(uint tokenId) external {
    require(msg.sender == address(cover), "CoverNFT: Not Cover module");
    _burn(tokenId);
  }
}
