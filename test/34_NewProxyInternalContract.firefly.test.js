// This is the automatically generated test file for contract: NewProxyInternalContract
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NewProxyInternalContract = artifacts.require('NewProxyInternalContract');
const {assertRevert} = require('./utils/assertRevert');

contract('NewProxyInternalContract', (accounts) => {
	// Coverage imporvement tests for NewProxyInternalContract
	describe('NewProxyInternalContractBlackboxTest', () => {
		it('call func nxMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewProxyInternalContract.new();
			const res = await obj.nxMasterAddress();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func changeDependentContractAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewProxyInternalContract.new();
			await assertRevert(obj.changeDependentContractAddress());
		});

	});
});