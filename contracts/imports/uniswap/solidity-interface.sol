pragma solidity 0.4.24;


contract Factory {
    function getExchange(address token) public view returns (address);
    function getToken(address exchange) public view returns (address);
}


contract Exchange { 
    function getEthToTokenInputPrice(uint256 ethSold) public view returns(uint256);

    function getTokenToEthInputPrice(uint256 tokensSold) public view returns(uint256);

    function ethToTokenSwapInput(uint256 minTokens, uint256 deadline) public payable returns (uint256);

    function ethToTokenTransferInput(uint256 minTokens, uint256 deadline, address recipient)
        public payable returns (uint256);

    function tokenToEthSwapInput(uint256 tokensSold, uint256 minEth, uint256 deadline)
        public payable returns (uint256);

    function tokenToEthTransferInput(uint256 tokensSold, uint256 minEth, uint256 deadline, address recipient) 
        public payable returns (uint256);

    function tokenToTokenSwapInput(
        uint256 tokensSold,
        uint256 minTokensBought,
        uint256 minEthBought,
        uint256 deadline,
        address tokenAddress
    ) 
        public returns (uint256);

    function tokenToTokenTransferInput(
        uint256 tokensSold,
        uint256 minTokensBought,
        uint256 minEthBought,
        uint256 deadline,
        address recipient,
        address tokenAddress
    )
        public returns (uint256);
}
