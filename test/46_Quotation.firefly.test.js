// This is the automatically generated test file for contract: Quotation
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const Quotation = artifacts.require('Quotation');
const {assertRevert} = require('./utils/assertRevert');
const {assertInvalid} = require('./utils/assertInvalid');

contract('Quotation', (accounts) => {
	// Coverage imporvement tests for Quotation
	describe('QuotationBlackboxTest', () => {
		it('call func expireCover with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Quotation.new();
			const arg0 = "45245043694169641572197862589718334685367534174665645512775708849586664198615";
			await assertRevert(obj.expireCover(arg0));
		});

		it('call func verifySign with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Quotation.new();
			const arg0 = ["38736900509558466448668448007376309605176426642541642521782009608738865358027"];
			const arg1 = "62483";
			const arg2 = "0x68ccfe39";
			const arg3 = "0x1e9e26f4bdba7f589c0e21fa084632390e3f7284";
			const arg4 = "240";
			const arg5 = "0x4cad47fa832b08ecfe018b6ffd965bf87175c7bf69814141b355b58fe0082992";
			const arg6 = "0x9d868a6f0337aa57754b189f9f3be6350ac5e3474a919886d90e605428a803fd";
			await assertRevert(obj.verifySign(arg0, arg1, arg2, arg3, arg4, arg5, arg6));
		});

		it('call func getOrderHash with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Quotation.new();
			const arg0 = ["60602065396742230480688081058347384944091887782185106323341322608008949154112"];
			const arg1 = "23899";
			const arg2 = "0x16a0e65b";
			const arg3 = "0x64573e7a023f619cdd011b304f90196788f92f59";
			await assertInvalid(obj.getOrderHash(arg0, arg1, arg2, arg3));
		});

		it('call func isValidSignature with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Quotation.new();
			const arg0 = "0xb74216c1ec5e1f7f1f8c9e7ef428dd1fc1d76bf6ebeafdca9e2d55acf079b660";
			const arg1 = "224";
			const arg2 = "0x61db2e1e59004c0f7f14aaf363b9085c1b54dce9d0d1243f208113ce1a462728";
			const arg3 = "0xe1b3eb9ffac20b3bcad307e006e8f0aa5ecb56731f5586dadcd89c12becd4238";
			await assertRevert(obj.isValidSignature(arg0, arg1, arg2, arg3));
		});

	});
});