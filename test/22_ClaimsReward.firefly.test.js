// This is the automatically generated test file for contract: ClaimsReward
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const ClaimsReward = artifacts.require('ClaimsReward');
const {assertRevert} = require('./utils/assertRevert');

contract('ClaimsReward', (accounts) => {
	// Coverage imporvement tests for ClaimsReward
	describe('ClaimsRewardBlackboxTest', () => {
		it('call func getRewardToBeGiven with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ClaimsReward.new();
			const arg0 = "58102126683887842840195786054041603212454529026736966244268302915296507097407";
			const arg1 = "81722059336739439848300333059437520690107129960834267036902770013631590329940";
			const arg2 = "66611268526484428184855834628428101646419429294533795562113944205673084489626";
			await assertRevert(obj.getRewardToBeGiven(arg0, arg1, arg2));
		});

		it('call func _claimStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ClaimsReward.new();
			const arg0 = "80920097935507539518005182320930946670424102393564801648116909328920553726093";
			const arg1 = "0xe5a7e952d14de532f9adb47ec8570678083e78b0";
			await assertRevert(obj._claimStakeCommission(arg0, arg1));
		});

	});
});