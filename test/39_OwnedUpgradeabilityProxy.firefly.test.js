// This is the automatically generated test file for contract: OwnedUpgradeabilityProxy
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');

contract('OwnedUpgradeabilityProxy', (accounts) => {
	// Coverage imporvement tests for OwnedUpgradeabilityProxy
	describe('OwnedUpgradeabilityProxyBlackboxTest', () => {
		it('call func upgradeTo with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await OwnedUpgradeabilityProxy.new("0xce47831908cf7011b74d0d776899d7a982cc4316");
			const arg0 = "0x04017ca8f3f361a7d5939b2ef38891e44e21cd9e";
			const res = await obj.upgradeTo(arg0);
			expect(res).to.be.an('object');
		});

	});
});