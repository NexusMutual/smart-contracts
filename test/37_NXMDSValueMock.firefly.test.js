// This is the automatically generated test file for contract: NXMDSValueMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NXMDSValueMock = artifacts.require('NXMDSValueMock');
const {assertRevert} = require('./utils/assertRevert');

contract('NXMDSValueMock', (accounts) => {
	// Coverage imporvement tests for NXMDSValueMock
	describe('NXMDSValueMockBlackboxTest', () => {
		it('call func rate with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMDSValueMock.new("0x8d7b0df3a484b4bab7f72a85f3832a692bd06e9a");
			const res = await obj.rate();
			res.toString().should.be.equal("8333333333333333");
		});

		it('call func setRate with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMDSValueMock.new("0x2a99e2b4328e9ec31f5bbf784c55854b6c6101a8");
			const arg0 = "58146220370576763314328325531277273411195321326792295318104306987325083382704";
			await assertRevert(obj.setRate(arg0));
		});

		it('call func setZeroRate with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMDSValueMock.new("0x344073d7f1e303ba748a38245666995d79100ea3");
			const arg0 = "false";
			await assertRevert(obj.setZeroRate(arg0));
		});

		it('call func owner with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMDSValueMock.new("0x5614d258172718424e1dc82d17a32c9374039496");
			const res = await obj.owner();
			res.toString().should.be.equal("0x5614D258172718424E1dC82D17a32C9374039496");
		});

	});
});