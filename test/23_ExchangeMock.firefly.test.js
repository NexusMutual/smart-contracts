// This is the automatically generated test file for contract: ExchangeMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const ExchangeMock = artifacts.require('ExchangeMock');
const {assertRevert} = require('./utils/assertRevert');

contract('ExchangeMock', (accounts) => {
	// Coverage imporvement tests for ExchangeMock
	describe('ExchangeMockBlackboxTest', () => {
		it('call func ethToTokenSwapInput with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ExchangeMock.new("0x4d6084bb2d14db2dab2f2df0e968230b09e2d7a6", "0x2ba550ec54cbaee5d4aa7ab101b0d0ff7ed8178f");
			const arg0 = "112164380260512549052717020384748891734165041653544042583861324749578344516937";
			const arg1 = "105769999680658345000489474414902320462614632991227828901126744300419493971290";
			await assertRevert(obj.ethToTokenSwapInput(arg0, arg1));
		});

		it('call func rateFactor with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ExchangeMock.new("0x5254847cd4a4714d6c48fe38c6101490efb3b21f", "0x8675a7ade29403066ef62e53a20035974f5d2e91");
			await assertRevert(obj.rateFactor());
		});

	});
});