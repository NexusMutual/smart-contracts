// This is the automatically generated test file for contract: NewInternalContract
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NewInternalContract = artifacts.require('NewInternalContract');
const {assertRevert} = require('./utils/assertRevert');

contract('NewInternalContract', (accounts) => {
	// Coverage imporvement tests for NewInternalContract
	describe('NewInternalContractBlackboxTest', () => {
		it('call func nxMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewInternalContract.new();
			const res = await obj.nxMasterAddress();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func changeDependentContractAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewInternalContract.new();
			await assertRevert(obj.changeDependentContractAddress());
		});

		it('call func changeMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewInternalContract.new();
			const arg0 = "0xa5f2370e06ecc52705fe9cbabf574ab388f6c6e8";
			const res = await obj.changeMasterAddress(arg0);
			expect(res).to.be.an('object');
		});

	});
});