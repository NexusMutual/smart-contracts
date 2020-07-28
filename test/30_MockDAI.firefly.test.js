// This is the automatically generated test file for contract: MockDAI
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const MockDAI = artifacts.require('MockDAI');
const {assertRevert} = require('./utils/assertRevert');

contract('MockDAI', (accounts) => {
	// Coverage imporvement tests for MockDAI
	describe('MockDAIBlackboxTest', () => {
		it('call func totalSupply with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const res = await obj.totalSupply();
			res.toString().should.be.equal("999999000000000000000000");
		});

		it('call func decreaseAllowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const arg0 = "0x72af462e6063762ec54b5a1340f315ce3c35ffee";
			const arg1 = "21421593508946576050319457260597768642568102943684974374986425480473388628679";
			await assertRevert(obj.decreaseAllowance(arg0, arg1));
		});

		it('call func allowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const arg0 = "0xa97acef3691d742d743e7ccc4b6222190a93df9b";
			const arg1 = "0x2c94c20d2fc81b0b881ea57c136dd4985c80ae26";
			const res = await obj.allowance(arg0, arg1);
			res.toString().should.be.equal("0");
		});

		it('call func symbol with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const res = await obj.symbol();
			res.toString().should.be.equal("DAI");
		});

		it('call func decimals with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const res = await obj.decimals();
			res.toString().should.be.equal("18");
		});

		it('call func increaseAllowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const arg0 = "0xf6f5864102eeb1810094d15077512579d5a7ffc1";
			const arg1 = "28452427355439507092323481790512480715347575329867867435701903317635855889704";
			const res = await obj.increaseAllowance(arg0, arg1);
			expect(res).to.be.an('object');
		});

		it('call func name with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockDAI.new();
			const res = await obj.name();
			res.toString().should.be.equal("DAI");
		});

	});
});