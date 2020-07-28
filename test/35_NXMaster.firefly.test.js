// This is the automatically generated test file for contract: NXMaster
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NXMaster = artifacts.require('NXMaster');
const {assertRevert} = require('./utils/assertRevert');

contract('NXMaster', (accounts) => {
	// Coverage imporvement tests for NXMaster
	describe('NXMasterBlackboxTest', () => {
		it('call func closeClaim with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const arg0 = "29521300311847926266206205964422162741429598024077478844719018473210777654093";
			await assertRevert(obj.closeClaim(arg0));
		});

		it('call func updateOwnerParameters with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const arg0 = "0x8953f58c893aed0c";
			const arg1 = "0x79317513fd5d665e16fedb092df9b27372264b56";
			await assertRevert(obj.updateOwnerParameters(arg0, arg1));
		});

		it('call func contractsActive with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const arg0 = "0x53507c1d0793173094f598113c2019ebf7b15f81";
			const res = await obj.contractsActive(arg0);
			res.toString().should.be.equal("false");
		});

		it('call func getVersionData with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const res = await obj.getVersionData();
			expect(res).to.be.an('object');
		});

		it('call func getOwnerParameters with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const arg0 = "0x51c15154b50deaaf";
			const res = await obj.getOwnerParameters(arg0);
			expect(res).to.be.an('object');
		});

		it('call func addNewVersion with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const arg0 = ["0x7433093624bb2abe88f5a65e8128648efbc2eb7c"];
			await assertRevert(obj.addNewVersion(arg0));
		});

		it('call func updatePauseTime with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMaster.new();
			const arg0 = "1283585863236968758606414571008569607299240587202474903745982580009184591252";
			await assertRevert(obj.updatePauseTime(arg0));
		});

	});
});