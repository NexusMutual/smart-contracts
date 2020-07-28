// This is the automatically generated test file for contract: MockMKR
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const MockMKR = artifacts.require('MockMKR');
const {assertRevert} = require('./utils/assertRevert');

contract('MockMKR', (accounts) => {
	// Coverage imporvement tests for MockMKR
	describe('MockMKRBlackboxTest', () => {
		it('call func decreaseAllowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const arg0 = "0xd66e62b745b7b730847a199d941c48751b851e6a";
			const arg1 = "104983416598992176469526264305694539719815726026371709561185972337338405442534";
			await assertRevert(obj.decreaseAllowance(arg0, arg1));
		});

		it('call func increaseAllowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const arg0 = "0x76ce052e50fb541bb00e20e858917561e251c294";
			const arg1 = "99016818864077790556233425110239357409833481614600012086033844075155470495700";
			const res = await obj.increaseAllowance(arg0, arg1);
			expect(res).to.be.an('object');
		});

		it('call func allowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const arg0 = "0xa323f6c48c5f30f059e4a146545608fb8ce94386";
			const arg1 = "0x7c62c154cd979d93f2d9f8571769bcec3951b7ac";
			const res = await obj.allowance(arg0, arg1);
			res.toString().should.be.equal("0");
		});

		it('call func totalSupply with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const res = await obj.totalSupply();
			res.toString().should.be.equal("999999000000000000000000");
		});

		it('call func decimals with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const res = await obj.decimals();
			res.toString().should.be.equal("18");
		});

		it('call func name with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const res = await obj.name();
			res.toString().should.be.equal("MKR");
		});

		it('call func symbol with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MockMKR.new();
			const res = await obj.symbol();
			res.toString().should.be.equal("MKR");
		});

	});
});