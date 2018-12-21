pragma solidity 0.4.24;


contract Factory {

	mapping (address => address) internal exchange;

	mapping (address => address) internal token;
	
	function getExchange(address _tokenAddress) public view returns (address) {
		return exchange[_tokenAddress];
	}

	function getToken(address _exchangeAddress) public view returns (address) {
		return token[_exchangeAddress];
	}

	function setFactory(address _tokenAddress, address _exchangeAddress) public {
		exchange[_tokenAddress] = _exchangeAddress;
		token[_exchangeAddress] = _tokenAddress;
	}
		
}