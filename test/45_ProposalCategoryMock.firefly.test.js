// This is the automatically generated test file for contract: ProposalCategoryMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const ProposalCategoryMock = artifacts.require('ProposalCategoryMock');
const {assertRevert} = require('./utils/assertRevert');

contract('ProposalCategoryMock', (accounts) => {
	// Coverage imporvement tests for ProposalCategoryMock
	describe('ProposalCategoryMockBlackboxTest', () => {
		it('call func nxMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategoryMock.new();
			const res = await obj.nxMasterAddress();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func isAuthorizedToGovern with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategoryMock.new();
			const arg0 = "0x92cb65639807e2c11ab243f2a4ce17141dd94068";
			await assertRevert(obj.isAuthorizedToGovern(arg0));
		});

	});
});