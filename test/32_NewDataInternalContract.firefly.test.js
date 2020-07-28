// This is the automatically generated test file for contract: NewDataInternalContract
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NewDataInternalContract = artifacts.require('NewDataInternalContract');
const {assertRevert} = require('./utils/assertRevert');

contract('NewDataInternalContract', (accounts) => {
	// Coverage imporvement tests for NewDataInternalContract
	describe('NewDataInternalContractBlackboxTest', () => {
		it('call func changeDependentContractAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewDataInternalContract.new();
			await assertRevert(obj.changeDependentContractAddress());
		});

		it('call func nxMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewDataInternalContract.new();
			const res = await obj.nxMasterAddress();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func changeMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NewDataInternalContract.new();
			const arg0 = "0x4b314b93f0418a9206318370f245d55e5ac88dd5";
			const res = await obj.changeMasterAddress(arg0);
			expect(res).to.be.an('object');
		});

	});
});