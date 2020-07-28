// This is the automatically generated test file for contract: PoolDataMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const PoolDataMock = artifacts.require('PoolDataMock');
const {assertInvalid} = require('./utils/assertInvalid');

contract('PoolDataMock', (accounts) => {
	// Coverage imporvement tests for PoolDataMock
	describe('PoolDataMockBlackboxTest', () => {
		it('call func allMCRData with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PoolDataMock.new("0x0ee60dc3be562b086b71762956c148106eaa562b", "0xc69d65d876cab2fe049e87b32a5fc2ca440d2c4d", "0xd1472fbe861d6d5ae43434846a706270ad1421e2");
			const arg0 = "14619106044536873067210408454013400715426233116782078341216224560580263344759";
			await assertInvalid(obj.allMCRData(arg0));
		});

		it('call func allAPIid with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PoolDataMock.new("0x18a6143c4930c401c1aa75ea3a3e60a759f7b96e", "0xee1d80d3ac2b18e004379d86abdaf8c30caa6e0d", "0x1f9e5e60767c1e3faa14e89414d9c8a615e6c6a3");
			const arg0 = "0x7bbe67d53a9a1842f402d75e5259d76637069962132e85fc145890e78ff6b00b";
			const res = await obj.allAPIid(arg0);
			expect(res).to.be.an('object');
		});

	});
});