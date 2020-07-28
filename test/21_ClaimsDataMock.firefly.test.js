// This is the automatically generated test file for contract: ClaimsDataMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const ClaimsDataMock = artifacts.require('ClaimsDataMock');
const {assertRevert} = require('./utils/assertRevert');

contract('ClaimsDataMock', (accounts) => {
	// Coverage imporvement tests for ClaimsDataMock
	describe('ClaimsDataMockBlackboxTest', () => {
		it('call func setpendingClaimStart with blackbox random args', async () => {
			const obj = await ClaimsDataMock.new();
			const arg0 = "110772705976589183854191158578678617448739389744711223478168516898589387215075";
			await assertRevert(obj.setpendingClaimStart(arg0));
		});

		it('call func addClaimVotemember with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ClaimsDataMock.new();
			const arg0 = "4011642190602083527064334297918495208205478292203514141685801723076513808966";
			const arg1 = "24169771776117735479654509731832932411266089910549138814941102373495574798845";
			await assertRevert(obj.addClaimVotemember(arg0, arg1));
		});

	});
});