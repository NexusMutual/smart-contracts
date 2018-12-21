pragma solidity 0.4.24;

import "./Factory.sol";
import "../imports/openzeppelin-solidity/token/ERC20/ERC20.sol";


contract Exchange {

    ERC20 internal token;
    Factory internal factory;

    constructor (address tokenAddress) public {
        token = ERC20(tokenAddress);
    }
 
    function getEthToTokenInputPrice(uint256 ethSold) public view returns(uint256) {
        require(ethSold > 0);
        uint256 tokenReserve = token.balanceOf(address(this));
        return getInputPrice(ethSold, address(this).balance, tokenReserve);	
    }

    function getTokenToEthInputPrice(uint256 tokensSold) public view returns(uint256) {
        require(tokensSold > 0);
        uint256 tokenReserve = token.balanceOf(address(this));
        uint256 ethBought = getInputPrice(tokensSold, tokenReserve, address(this).balance);
        return (ethBought * 10**18);
    }

    function ethToTokenSwapInput(
        uint256 minTokens,
        uint256 deadline
    )
        public
        payable
        returns (uint256)
    {
        return ethToTokenInput(msg.value, minTokens, deadline, msg.sender, msg.sender);
    }

    function ethToTokenTransferInput(
        uint256 minTokens,
        uint256 deadline,
        address recipient
    )
        public
        payable
        returns (uint256) 
    {
        require(recipient != address(this) && recipient != address(0));
        return ethToTokenInput(msg.value, minTokens, deadline, msg.sender, recipient);   
    }

    function tokenToEthSwapInput(
        uint256 tokensSold,
        uint256 minEth,
        uint256 deadline
    )
        public
        payable 
        returns (uint256)
    {
        return tokenToEthInput(tokensSold, minEth, deadline, msg.sender, msg.sender);
    }

    function tokenToEthTransferInput(
        uint256 tokensSold,
        uint256 minEth,
        uint256 deadline,
        address recipient
    )
        public
        payable
        returns (uint256) 
    {
        require(recipient != address(this) && recipient != address(0));
        return tokenToEthInput(tokensSold, minEth, deadline, msg.sender, recipient);
    }

    function tokenToTokenSwapInput(
        uint256 tokensSold,
        uint256 minTokensBought,
        uint256 minEthBought,
        uint256 deadline,
        address tokenAddress
    )
        public
        returns (uint256)
    {
        address exchangeAddress = factory.getExchange(tokenAddress);
        return tokenToTokenInput(
            tokensSold,
            minTokensBought,
            minEthBought,
            deadline,
            msg.sender,
            msg.sender,
            exchangeAddress
        );
    }

    function tokenToTokenTransferInput(
        uint256 tokensSold,
        uint256 minTokensBought,
        uint256 minEthBought,
        uint256 deadline,
        address recipient,
        address tokenAddress
    )
        public
        returns (uint256)
    {
        address exchangeAddress = factory.getExchange(tokenAddress);
        return tokenToTokenInput(
            tokensSold,
            minTokensBought,
            minEthBought,
            deadline,
            msg.sender,
            recipient,
            exchangeAddress
        );
    }

    function getInputPrice(
        uint256 inputAmount,
        uint256 inputReserve,
        uint256 outputReserve
    )
        internal
        pure
        returns(uint256)
    {
        require(inputReserve > 0 && outputReserve > 0);
        uint256 inputAmountWithFee = inputAmount * 997;
        uint256 numerator = inputAmountWithFee * outputReserve;
        uint256 denominator = (inputReserve * 1000) + inputAmountWithFee;
        return (numerator / denominator);
    }

    function getOutputPrice(
        uint256 outputAmount,
        uint256 inputReserve,
        uint256 outputReserve
    )
        internal
        pure
        returns(uint256)
    {
        require(inputReserve > 0 && outputReserve > 0);
        uint256 numerator = inputReserve * outputAmount * 1000;
        uint256 denominator = (outputReserve - outputAmount) * 997;
        return (numerator / denominator + 1);
    }

    function ethToTokenInput(
        uint256 ethSold,
        uint256 minTokens,
        uint256 deadline,
        address buyer,
        address recipient
    )
        internal
        returns (uint256)
    {
        require(deadline >= block.timestamp && ethSold > 0 && minTokens > 0);
        uint256 tokenReserve = token.balanceOf(address(this));
        uint256 tokensBought = getInputPrice(ethSold, (address(this).balance - ethSold), tokenReserve);
        require(tokensBought >= minTokens);
        require(token.transfer(recipient, tokensBought));
        buyer;
        return tokensBought;
    }

    function tokenToTokenInput(
        uint256 tokensSold,
        uint256 minTokensBought,
        uint256 minEthBought,
        uint256 deadline,
        address buyer,
        address recipient,
        address exchangeAddress
    )
        internal
        returns (uint256)
    {
        require((deadline >= block.timestamp && tokensSold > 0) && (minTokensBought > 0 && minEthBought > 0));
        require(exchangeAddress != address(this) && exchangeAddress != address(0));
        uint256 tokenReserve = token.balanceOf(address(this));
        uint256 ethBought = getInputPrice(tokensSold, tokenReserve, address(this).balance);
        uint256 weiBought = (ethBought * 10**18);
        require(weiBought >= minEthBought);
        require(token.transferFrom(buyer, address(this), tokensSold));
        uint256 tokensBought = Exchange(exchangeAddress).ethToTokenTransferInput.value(
            weiBought)(minTokensBought, deadline, recipient);
        // log.EthPurchase(buyer, tokensSold, weiBought);
        return tokensBought;
    }

    function tokenToEthInput(
        uint256 tokensSold,
        uint256 minEth,
        uint256 deadline,
        address buyer,
        address recipient
    )
        internal
        returns (uint256)
    {
        require(deadline >= block.timestamp && tokensSold > 0 && minEth > 0);
        uint256 tokenReserve = token.balanceOf(address(this));
        uint256 ethBought = getInputPrice(tokensSold, tokenReserve, address(this).balance);
        uint256 weiBought = ethBought * (10**18);
        require(weiBought >= minEth);
        recipient.transfer(weiBought);
        require(token.transferFrom(buyer, address(this), tokensSold));
        // log.EthPurchase(buyer, tokens_sold, wei_bought)
        return weiBought;
    }
}