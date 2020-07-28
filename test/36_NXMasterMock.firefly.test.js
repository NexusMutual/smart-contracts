// This is the automatically generated test file for contract: NXMasterMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NXMasterMock = artifacts.require('NXMasterMock');
const {assertRevert} = require('./utils/assertRevert');

contract('NXMasterMock', (accounts) => {
	// Coverage imporvement tests for NXMasterMock
	describe('NXMasterMockBlackboxTest', () => {
		it('call func addNewInternalContract with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMasterMock.new();
			const arg0 = "0x9495";
			const arg1 = "0x365ffc2ec98c0b8d25b534f49f9fd236326cab57";
			const arg2 = "115157969095469944535984955316038961074107920630897595909531747270204390967328";
			await assertRevert(obj.addNewInternalContract(arg0, arg1, arg2));
		});

		it('call func isAuthorizedToGovern with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMasterMock.new();
			const arg0 = "0x1b9ddd59fff948cd9e48e51c69f9982d89a8cfe1";
			await assertRevert(obj.isAuthorizedToGovern(arg0));
		});

		it('call func getVersionData with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMasterMock.new();
			const res = await obj.getVersionData();
			expect(res).to.be.an('object');
		});

		it('call func addEmergencyPause with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMasterMock.new();
			const arg0 = "true";
			const arg1 = "0x92cc385e";
			await assertRevert(obj.addEmergencyPause(arg0, arg1));
		});

	});
});