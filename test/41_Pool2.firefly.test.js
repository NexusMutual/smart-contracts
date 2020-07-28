// This is the automatically generated test file for contract: Pool2
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const Pool2 = artifacts.require('Pool2');

contract('Pool2', (accounts) => {
	// Coverage imporvement tests for Pool2
	describe('Pool2BlackboxTest', () => {
		it('call func changeMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool2.new("0x041c83c8fcbb241d9a88b96991b8eb5401d597f2");
			const arg0 = "0xc31fa8c602cdf6ba131693f10b23287a4e2aff97";
			const res = await obj.changeMasterAddress(arg0);
			expect(res).to.be.an('object');
		});

	});
});