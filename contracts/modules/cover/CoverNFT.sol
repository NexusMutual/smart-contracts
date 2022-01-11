
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "../../interfaces/ICover.sol";

contract CoverNFT is ERC721 {

  address public operator;

  modifier onlyOperator {
    require(msg.sender == operator, "CoverNFT: Not operator");
    _;
  }

  constructor(string memory name_, string memory symbol_, address _operator) ERC721(name_, symbol_) {
    operator = _operator;

  }

  function safeMint(address to, uint tokenId) external onlyOperator {
    _safeMint(to, tokenId);
  }

  function isApprovedOrOwner(address spender, uint tokenId) external view returns (bool) {
    return _isApprovedOrOwner(spender, tokenId);
  }

  function burn(uint tokenId) external onlyOperator {
    _burn(tokenId);
  }

  function operatorTransferFrom(address from, address to, uint256 tokenId) external onlyOperator {
    _transfer(from, to, tokenId);
  }


  function changeOperator(address _newOperator) public onlyOperator returns (bool) {
    operator = _newOperator;
    return true;
  }
}
