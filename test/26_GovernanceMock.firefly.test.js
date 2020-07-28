// This is the automatically generated test file for contract: GovernanceMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const GovernanceMock = artifacts.require('GovernanceMock');

contract('GovernanceMock', (accounts) => {
	// Coverage imporvement tests for GovernanceMock
	describe('GovernanceMockBlackboxTest', () => {
		it('call func isOpenForDelegation with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await GovernanceMock.new();
			const arg0 = "0x012115895c5e7783cbc44248fc7ead58b6d49fdc";
			const res = await obj.isOpenForDelegation(arg0);
			res.toString().should.be.equal("false");
		});

		it('call func proposalVoteTally with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await GovernanceMock.new();
			const arg0 = "25754670974843739582484924235812428143341387358621712066819489138440085809717";
			const res = await obj.proposalVoteTally(arg0);
			res.toString().should.be.equal("0");
		});

	});
});