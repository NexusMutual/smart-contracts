// This is the automatically generated test file for contract: FactoryMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const FactoryMock = artifacts.require('FactoryMock');

contract('FactoryMock', (accounts) => {
	// Coverage imporvement tests for FactoryMock
	describe('FactoryMockBlackboxTest', () => {
		it('call func getToken with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await FactoryMock.new();
			const arg0 = "0x7b6068a61d55568303078f0eb18aea6f18405f3d";
			const res = await obj.getToken(arg0);
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

	});
});