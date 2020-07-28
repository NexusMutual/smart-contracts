// This is the automatically generated test file for contract: TokenController
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const TokenController = artifacts.require('TokenController');
const {assertRevert} = require('./utils/assertRevert');

contract('TokenController', (accounts) => {
	// Coverage imporvement tests for TokenController
	describe('TokenControllerBlackboxTest', () => {
		it('call func operatorTransfer with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenController.new();
			const arg0 = "0xbd29c2fd6fd63db51b6891419ced098d2deac4fa";
			const arg1 = "0x25072718fdb5dd92c9abff34ee56dd0ac99b945b";
			const arg2 = "35012473037026861661261321358651369094824671792642583269799540381825844739647";
			await assertRevert(obj.operatorTransfer(arg0, arg1, arg2));
		});

		it('call func pooledStaking with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenController.new();
			const res = await obj.pooledStaking();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

	});
});