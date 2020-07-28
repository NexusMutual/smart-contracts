// This is the automatically generated test file for contract: PooledStakingMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const PooledStakingMock = artifacts.require('PooledStakingMock');
const {assertInvalid} = require('./utils/assertInvalid');

contract('PooledStakingMock', (accounts) => {
	// Coverage imporvement tests for PooledStakingMock
	describe('PooledStakingMockBlackboxTest', () => {
		it('call func rewards with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "106186880810849267837550111169288142720343475485080180758034036842250570152943";
			const res = await obj.rewards(arg0);
			expect(res).to.be.an('object');
		});

		it('call func stakerContractsArray with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "0x2297198ca48dea7ce661d27b780e5a331dba1f1e";
			const res = await obj.stakerContractsArray(arg0);
			res.toString().should.be.equal("");
		});

		it('call func stakerContractPendingUnstakeTotal with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "0x5355aba789dca56bb04cd9282becdb7b542890eb";
			const arg1 = "0x56ba951c0f037721006ed8a543ad2a82611e002a";
			const res = await obj.stakerContractPendingUnstakeTotal(arg0, arg1);
			res.toString().should.be.equal("0");
		});

		it('call func unstakeRequestAtIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "24152439889652753902170171880852359023383760582843414152224740315271955076864";
			const res = await obj.unstakeRequestAtIndex(arg0);
			expect(res).to.be.an('object');
		});

		it('call func stakerContractAtIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "0x8fe362f4c34976777be22966e6ef72077c6836e7";
			const arg1 = "72186387025932383987792649251365275585064578197577831866730542373267764487592";
			await assertInvalid(obj.stakerContractAtIndex(arg0, arg1));
		});

		it('call func contractStakerCount with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "0x450fd2da9f9993efdf6015cb6b0e8dfcf2cceefd";
			const res = await obj.contractStakerCount(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func unstakeRequests with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "35933286771651742402173494941203640595641116649347830359987611124700207388443";
			const res = await obj.unstakeRequests(arg0);
			expect(res).to.be.an('object');
		});

		it('call func stakerContractCount with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await PooledStakingMock.new();
			const arg0 = "0xefead3bf266a9a34faa80eacbe5040f1a16ae9ac";
			const res = await obj.stakerContractCount(arg0);
			res.toString().should.be.equal("0");
		});

	});
});