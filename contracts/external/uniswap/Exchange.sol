pragma solidity ^0.5.0;


interface Factory {

  function getExchange(address token) external view returns (address);

  function getToken(address exchange) external view returns (address);
}


interface Exchange {

  function getEthToTokenInputPrice(uint256 ethSold) external view returns (uint256);

  function getTokenToEthInputPrice(uint256 tokensSold) external view returns (uint256);

  function ethToTokenSwapInput(uint256 minTokens, uint256 deadline) external payable returns (uint256);

  function ethToTokenTransferInput(uint256 minTokens, uint256 deadline, address recipient) external payable returns (uint256);

  function tokenToEthSwapInput(uint256 tokensSold, uint256 minEth, uint256 deadline) external payable returns (uint256);

  function tokenToEthTransferInput(uint256 tokensSold, uint256 minEth, uint256 deadline, address recipient) external payable returns (uint256);

  function tokenToTokenSwapInput(
    uint256 tokensSold,
    uint256 minTokensBought,
    uint256 minEthBought,
    uint256 deadline,
    address tokenAddress
  ) external returns (uint256);

  function tokenToTokenTransferInput(
    uint256 tokensSold,
    uint256 minTokensBought,
    uint256 minEthBought,
    uint256 deadline,
    address recipient,
    address tokenAddress
  ) external returns (uint256);
}
