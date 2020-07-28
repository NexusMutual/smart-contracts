// This is the automatically generated test file for contract: TokenFunctionMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const TokenFunctionMock = artifacts.require('TokenFunctionMock');
const {assertRevert} = require('./utils/assertRevert');

contract('TokenFunctionMock', (accounts) => {
	// Coverage imporvement tests for TokenFunctionMock
	describe('TokenFunctionMockBlackboxTest', () => {
		it('call func deprecated_getStakerAllLockedTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0x3829800571842d3bb7bd9bcd06fca39eb59b6a13";
			await assertRevert(obj.deprecated_getStakerAllLockedTokens(arg0));
		});

		it('call func tk with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const res = await obj.tk();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func deprecated_getStakerUnlockableTokensOnSmartContract with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0x20395473f65471b6b7f89bb0b6c2e476be063b53";
			const arg1 = "0x674f6f940a99d63208e938e3b4b0d7bd3481a4e8";
			const arg2 = "84390122486368301964549245459137217502142817659927988528524318625217503214512";
			await assertRevert(obj.deprecated_getStakerUnlockableTokensOnSmartContract(arg0, arg1, arg2));
		});

		it('call func deprecated_getStakerLockedTokensOnSmartContract with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0x0c91da1f6c41cf07e397fc2e3f5740b6aab5e1a0";
			const arg1 = "0xf7caa41f8c80d22c9f47e4774ceb28bb87f708f6";
			const arg2 = "18719034237583232813707961207380275763413782883894944796636194387092192894035";
			await assertRevert(obj.deprecated_getStakerLockedTokensOnSmartContract(arg0, arg1, arg2));
		});

		it('call func _deprecated_getStakerUnlockableTokensOnSmartContract with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0x58ada0c01d1795ee9c98c9c756e1008efa2c02ce";
			const arg1 = "0x1d486d326d5f4b06306983622d7bf34b349805c0";
			const arg2 = "83767493624892200611650731092623794994976922433541733217564602508321314423780";
			await assertRevert(obj._deprecated_getStakerUnlockableTokensOnSmartContract(arg0, arg1, arg2));
		});

		it('call func _deprecated_unlockableBeforeBurningAndCanBurn with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0x3e70b67262a6e0b9c1128dcb3f7886f579dfae49";
			const arg1 = "0x5f676cb91a0d0671ba795f3d0b97ac866f5b9cb3";
			const arg2 = "99912182287178481981829372837140991758512634857869518111112957120836258532079";
			await assertRevert(obj._deprecated_unlockableBeforeBurningAndCanBurn(arg0, arg1, arg2));
		});

		it('call func deprecated_getStakerAllUnlockableStakedTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0xd1056b702127f42be4c6f03b981ea3ec19e04942";
			await assertRevert(obj.deprecated_getStakerAllUnlockableStakedTokens(arg0));
		});

		it('call func changeMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0xa40d2bcdd5b1f8ed88b1ae0a8c94aee3cff2cdec";
			const res = await obj.changeMasterAddress(arg0);
			expect(res).to.be.an('object');
		});

		it('call func deprecated_getTotalStakedTokensOnSmartContract with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0xf98174f516ad339d2bddd7bd93e0fdf3e97eb678";
			await assertRevert(obj.deprecated_getTotalStakedTokensOnSmartContract(arg0));
		});

		it('call func deprecated_unlockStakerUnlockableTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenFunctionMock.new();
			const arg0 = "0xafd18e369774406b18e94a865cd676b3d3d78097";
			await assertRevert(obj.deprecated_unlockStakerUnlockableTokens(arg0));
		});

	});
});