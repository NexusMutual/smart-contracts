// This is the automatically generated test file for contract: QuotationDataMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const QuotationDataMock = artifacts.require('QuotationDataMock');
const {assertRevert} = require('./utils/assertRevert');
const {assertInvalid} = require('./utils/assertInvalid');


contract('QuotationDataMock', (accounts) => {
	// Coverage imporvement tests for QuotationDataMock
	describe('QuotationDataMockBlackboxTest', () => {
		it('call func changeHoldedCoverPeriod with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await QuotationDataMock.new("0x96c25e69b2230267f107205d2e6e17959360dd35", "0x66509cf6ec47573263e22fbbfc72bb640ac821d7");
			const arg0 = "66797225639873292688933947225741191736771951293467450948367372144234769446338";
			const arg1 = "55721";
			await assertInvalid(obj.changeHoldedCoverPeriod(arg0, arg1));
		});

		it('call func coverStatus with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await QuotationDataMock.new("0x02407817b6e352f0d7edd1d8ba405efb04ecddc9", "0xbcd6749a0d9fe759d8df106beee9e1549456f8c1");
			const arg0 = "3759526765800819666104847515867474755443368950887155999660821587165581145160";
			const res = await obj.coverStatus(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func changeInvestmentAssetAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await QuotationDataMock.new("0x7facfd2000baae598d98d8b7390520218ee509de", "0x2c52d4d704a3a687389575e63244757cc10bd98d");
			const arg0 = "0x313cd360";
			const arg1 = "0xe7e2ea2bc80749aedaaff256ac4d0e2aae673eb1";
			await assertRevert(obj.changeInvestmentAssetAddress(arg0, arg1));
		});

		it('call func userHoldedCover with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await QuotationDataMock.new("0xcdd8185938b892d61d6dc13c3e0240f14fe5cf8f", "0x6c2bd1861cf346a2ef674882a1b8246bdc549b58");
			const arg0 = "0x9a12465c54ecfcc757359f9054848c8c2225f55b";
			const arg1 = "49118743821803900844471807208247845013074043708788723347358151310687570457734";
			await assertInvalid(obj.userHoldedCover(arg0, arg1));
		});

		it('call func changeCurrencyAssetAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await QuotationDataMock.new("0x40000ddc2d9140f4c8e90e3f809d17ac216d3e54", "0x3a647548076cbb6b6bd7611ab3270a64d408a054");
			const arg0 = "0x261abb9b";
			const arg1 = "0xc0e8346f6729876b9bad5dd80893cc7d83c2228e";
			await assertRevert(obj.changeCurrencyAssetAddress(arg0, arg1));
		});

	});
});