// This is the automatically generated test file for contract: TokenDataMock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const TokenDataMock = artifacts.require('TokenDataMock');
const {assertRevert} = require('./utils/assertRevert');
const {assertInvalid} = require('./utils/assertInvalid');

contract('TokenDataMock', (accounts) => {
	// Coverage imporvement tests for TokenDataMock
	describe('TokenDataMockBlackboxTest', () => {
		it('call func pushUnlockableBeforeLastBurnTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x809c9cd4152a0eed837f554a15b50a10a6b5c484");
			const arg0 = "0x08ed37cab1ced264be49e120307bcf01f502b048";
			const arg1 = "565355103927223478371306396517062995051802743141233933225593509693188946290";
			const arg2 = "28559367771620761262783162964650049896738024522747517447826872277866996735670";
			await assertRevert(obj.pushUnlockableBeforeLastBurnTokens(arg0, arg1, arg2));
		});

		it('call func setLastCompletedStakeCommissionIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xf3b234075f40bd73a4b015eb1fe1eee1663e4d76");
			const arg0 = "0xbe52de5a02cefd10a1f4a07e4aa5c5955cbc184b";
			const arg1 = "35705552743728425182149078288036583962878706546623121257207831892566511497279";
			await assertRevert(obj.setLastCompletedStakeCommissionIndex(arg0, arg1));
		});

		it('call func setUnlockableBeforeLastBurnTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xbc627b0ffde5dadab2147b956ab4d6352582aa19");
			const arg0 = "0xb9a2ab900e6e72b5fe82972f29fb4b8ff44c93c9";
			const arg1 = "75755292152084597661195464800208573116379766415773610248311076623488170045091";
			const arg2 = "108116049175541183645101649312009467108218144978663464808374657455702449827397";
			await assertRevert(obj.setUnlockableBeforeLastBurnTokens(arg0, arg1, arg2));
		});

		it('call func stakedContractCurrentBurnIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x4b395dc16fa65d2c9baee0d914d189bd1c070381");
			const arg0 = "0xef62692bd83266ad2f12b79495a7e083f9cbea5d";
			const res = await obj.stakedContractCurrentBurnIndex(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func getStakedContractStakerByIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xd86ebcde617c87f8a5676c14b7e5facb69761543");
			const arg0 = "0x20f8835d634dfe675c26fcb0dabfa4a892f1353a";
			const arg1 = "82296449572580137360628407226380988668890692340029243416661056241455819866112";
			await assertInvalid(obj.getStakedContractStakerByIndex(arg0, arg1));
		});

		it('call func pushRedeemedStakeCommissions with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x5d39460acfa59a555bc6155d4439c6a8eebec065");
			const arg0 = "0x835be35b72f405c55e9f40f8cc1f41948fd4a59b";
			const arg1 = "74141587928406929212254956017059318280983351957300721747189786490345150817623";
			const arg2 = "88745951205852450748270559488883904989576114368483095949050833422116910668028";
			await assertRevert(obj.pushRedeemedStakeCommissions(arg0, arg1, arg2));
		});

		it('call func getStakedContractStakersLength with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x9d40b1008fefff21403745b794ec1e2758437355");
			const arg0 = "0x851a7a3acbe12c32beaa3f7f3ba60b288c28e96b";
			const res = await obj.getStakedContractStakersLength(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func pushEarnedStakeCommissions with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x7c359041ee2c507f8169db9f0020ccd72d18b45d");
			const arg0 = "0xdbf2331e1944b4146bbb6a3858aac9d50c42c156";
			const arg1 = "0xb0a0eba74b4b5f894f16110d5cf1b6ad2241d3b7";
			const arg2 = "47888026508284659329967600250826540518152187838991892202721633397516600261869";
			const arg3 = "93260874223523559218292380673116666316520281460469789324076655889267881304833";
			await assertRevert(obj.pushEarnedStakeCommissions(arg0, arg1, arg2, arg3));
		});

		it('call func getStakerStakedBurnedByIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xe7957ed79e3abd64e65d19e5c85b1122d1b27bfb");
			const arg0 = "0x590a7393735b12a7b9fbd47819adf085bf2ceb04";
			const arg1 = "39806311060973886843250868264996718258772629485515121472426575411437320975301";
			await assertInvalid(obj.getStakerStakedBurnedByIndex(arg0, arg1));
		});

		it('call func lastCompletedStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x5c1560a145cd8d9eac928d5b8d17c0bd53388267");
			const arg0 = "0xd0b4824d378983a0a310e1d6845919a984684926";
			const res = await obj.lastCompletedStakeCommission(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func bookTime with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x51b679c1bb103f22f37c339a6178643e25c85c9d");
			const res = await obj.bookTime();
			res.toString().should.be.equal("60");
		});

		it('call func getStakerEarnedStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xf6a39d84f7d43887570a2795771106b96f05799f");
			const arg0 = "0x1947668864cae5ac6917f7d4fe028dd98e923519";
			const arg1 = "77482676761836510942014948444887398049997662772790119427010840175829116509337";
			await assertInvalid(obj.getStakerEarnedStakeCommission(arg0, arg1));
		});

		it('call func stakerStakedContracts with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x0d39d2f131821f95d82492e5c2f1bee8b7f5a6c4");
			const arg0 = "0x08f23e131cbba7eb59ea9c65d7bf1cca97f53907";
			const arg1 = "39132478568696480716039595101719675434520789984725259816351212457992588724682";
			await assertInvalid(obj.stakerStakedContracts(arg0, arg1));
		});

		it('call func getStakerStakedContractByIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x113700780de81a8e51c95feca46a558f139f4913");
			const arg0 = "0x74262eb784d1986ef8fa3efd55e9ab87eabffabe";
			const arg1 = "35123064605399714224181972945495942205215307931509466875316013014097366647441";
			await assertInvalid(obj.getStakerStakedContractByIndex(arg0, arg1));
		});

		it('call func getStakerStakedContractIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x2deb86b971ff1393953a197d5bdec553d95288d8");
			const arg0 = "0xf57cba27094350dabd42532b37db776a244823a8";
			const arg1 = "114217611193792911712363909399650152265200892455240038611659372375215113848679";
			await assertInvalid(obj.getStakerStakedContractIndex(arg0, arg1));
		});

		it('call func updateUintParameters with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x23f7058ca32898868a2d4918ff92bf730610b0b7");
			const arg0 = "0x992c558600159986";
			const arg1 = "69821730503560024802663140585764847717026904669745770024988508086667474562526";
			await assertRevert(obj.updateUintParameters(arg0, arg1));
		});

		it('call func getStakerTotalReedmedStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x771c5932895eb029099d95f0ae8438a26bfc30b2");
			const arg0 = "0x5b9327e56d3119f246b7fca95e696a93ca891543";
			const res = await obj.getStakerTotalReedmedStakeCommission(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func addStake with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xcd35cbb381a404ef1c6100a37ab907133a092361");
			const arg0 = "0xe92fa6e759bba4e9c84fbf8746aec75a36483310";
			const arg1 = "0x67b47cf7f60bc48078fc0d79d137b514743781c3";
			const arg2 = "21151066223425617746222461087210858873406125403658500613883792460739061740699";
			await assertRevert(obj.addStake(arg0, arg1, arg2));
		});

		it('call func stakedContractStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xb6b2563622c0fcb002141320808fb6f8755ae54f");
			const arg0 = "0xc7468df6ddfaa52ffe884a9be7ec17128d416e9b";
			const arg1 = "34519157755216046290510261378009617394069695158518009610992388373384324093729";
			const res = await obj.stakedContractStakeCommission(arg0, arg1);
			expect(res).to.be.an('object');
		});

		it('call func pushBurnedTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xa0ddf253aeebea9fe66dc68853e56e8255f63d3e");
			const arg0 = "0x8fe2a27c31d28cefcf4da8ea77666c284ccd9a90";
			const arg1 = "48043874534688548800704778295282529762169397544142854562758650739492596444837";
			const arg2 = "44387408384046600272368205732790838229495903916544795782844115465803067226507";
			await assertRevert(obj.pushBurnedTokens(arg0, arg1, arg2));
		});

		it('call func stakedContractStakers with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xfc6fb383d7f0a2f959e8a438cee33c93cc1cb323");
			const arg0 = "0x5f4faaa97235c1f15528b41186aa0b41eb6cf61e";
			const arg1 = "13432512988405259883459207855384045929874133683474818104772574383657294526709";
			await assertInvalid(obj.stakedContractStakers(arg0, arg1));
		});

		it('call func setStakedContractCurrentCommissionIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xf4f33c550e9bb8ae10c630d22e825bbd30ba48b0");
			const arg0 = "0x8ddbd5502075aa51f5734a9d96b6e4f050f28d50";
			const arg1 = "73567578842980781321913543035467716932195053654651755739188668666765822811945";
			await assertRevert(obj.setStakedContractCurrentCommissionIndex(arg0, arg1));
		});

		it('call func getStakerTotalEarnedStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x41545b018481b0ec394ed4276aea76503b848386");
			const arg0 = "0x3ac5b521c4becad6409cc80628016bef3e9487e2";
			const res = await obj.getStakerTotalEarnedStakeCommission(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func getStakerRedeemedStakeCommission with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x2657a1cdde468045c9e8ad7dda07df1838942fe2");
			const arg0 = "0x9f205e7c31694b0b88c18347279a6292594b7f42";
			const arg1 = "84529025126007525583659571334626795969197180093180913257307759700503122867685";
			await assertInvalid(obj.getStakerRedeemedStakeCommission(arg0, arg1));
		});

		it('call func stakedContractCurrentCommissionIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xa81365d2d388ff665890154254d58e171b7122b8");
			const arg0 = "0xa761395dd5566e23adb88213640ae274acbbf21e";
			res = await obj.stakedContractCurrentCommissionIndex(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func getStakerStakedUnlockableBeforeLastBurnByIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x13c101d7b8281030dcea41573bd696c84b5007b1");
			const arg0 = "0x99566251835695b575cfc1348e387e78b48c79b1";
			const arg1 = "81668157720265931093596367469548898389515106832776565544487842027757133553230";
			await assertInvalid(obj.getStakerStakedUnlockableBeforeLastBurnByIndex(arg0, arg1));
		});

		it('call func pushUnlockedStakedTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0xdacd2af566a0a4530fc2e1202c10c414d9a79bc9");
			const arg0 = "0x18656bb2818d08fe5cfff5a5e24b1976c86b9197";
			const arg1 = "108208937485365496076117588751163695800589805965899041371395983348902519024864";
			const arg2 = "94433698679589020104913348919546636263078548953100804369252386289816627906305";
			await assertRevert(obj.pushUnlockedStakedTokens(arg0, arg1, arg2));
		});

		it('call func setStakedContractCurrentBurnIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await TokenDataMock.new("0x965cd10c81927fd60d2bed08657848ac3de00483");
			const arg0 = "0x738efc7145b9e67be9d456728b28d8ce43cc2bba";
			const arg1 = "52883991494109930140477702287634513153982563750086610118141600713093149107083";
			await assertRevert(obj.setStakedContractCurrentBurnIndex(arg0, arg1));
		});

	});
});