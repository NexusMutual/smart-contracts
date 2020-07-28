// This is the automatically generated test file for contract: MCR
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const MCR = artifacts.require('MCR');
const {assertRevert} = require('./utils/assertRevert');

contract('MCR', (accounts) => {
	// Coverage imporvement tests for MCR
	describe('MCRBlackboxTest', () => {
		it('call func changeDependentContractAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MCR.new();
			await assertRevert(obj.changeDependentContractAddress());
		});

	});
});