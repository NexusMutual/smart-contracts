// This is the automatically generated test file for contract: Governance
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const Governance = artifacts.require('Governance');
const {assertRevert} = require('./utils/assertRevert');

contract('Governance', (accounts) => {
	// Coverage imporvement tests for Governance
	describe('GovernanceBlackboxTest', () => {
		it('call func ms with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const res = await obj.ms();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func changeDependentContractAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			await assertRevert(obj.changeDependentContractAddress());
		});

		it('call func setDelegationStatus with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "false";
			await assertRevert(obj.setDelegationStatus(arg0));
		});

		it('call func getUintParameters with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "0x864b11974d239f1b";
			const res = await obj.getUintParameters(arg0);
			expect(res).to.be.an('object');
		});

		it('call func updateProposal with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "44184787390246806700052258179334529073766633177985470422912529562798747109819";
			const arg1 = "'c7KTq\\y jN{=QuZ\"(9b\"X6[l\''";
			const arg2 = "\"SjOli4.KfxFw0c0wizWHya+vUwW27<LIr'\"";
			const arg3 = "'Q+IFJ]jZ+ hju3\\ed.r*Zg,\"CuKDd][VSQIEM'";
			await assertRevert(obj.updateProposal(arg0, arg1, arg2, arg3));
		});

		it('call func submitProposalWithSolution with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "78819691442755916025573851414633303759304114503734624336363522436903961168554";
			const arg1 = "'t^Sgjr/bi8h1(p4x\"34Uk).D,\\6\'3\'(a*;;Hf7Xt_N#EOJ]LWNsbt4eRb:*4`R\\t{Os(t+HOrpdjs--L1Ciw4/)<\\Vd|^:.S\\vYLEw%|i1F<wXGy!;R{C_ p|(o5wHH1aat-9hS[|t[1p2KDM(VeUrM)W+=e,q/,(h<O`G=pA%ZnVL34'";
			const arg2 = "0x7cdf32b48b5b870436d0557f30f6fc9931bc63122bcc707ed4a913a3d8997191dcfafc3f78cd50ce3ffb14c42ff27a7ac766e9cde3c7b8d3e98a4281d751255522b3b423a453602b412f824295b67925dcf653abdf246b8230b00d03911f70c4f8870c1ce8e64a9d6411b23695519b162fcc39cb645df597574f8ca5626e08bb6676518a1564927054c4408937c3f81f4690060f7df804cae96b70a5f7653c1ba49bf734fa4d";
			await assertRevert(obj.submitProposalWithSolution(arg0, arg1, arg2));
		});

		it('call func addSolution with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "77903931179213654988115398157350028763741183345088561628243112422272310208117";
			const arg1 = "'jS9\\3Z3*S`D=xcduR%uGy:)?3>Wrb=)}$N*=pD*eLj0*qD8'";
			const arg2 = "0x72935bd559f36971b312773469e6cdc793023a0be31488e54fa908ff8656e987000ef195eb81a797773de0dbb39814d1f47992277a7a75598c1e60df6b9455f7714d8a7123c1e4f6a1573fc584564415865a29b9e76474b1446552bef9a1c77204104466eefd1b778f741775afd81940c769dd843fa01e0db6acdd22152be99574033f3bb9edc5545af641f02d8aff63e59edd5cf4a24557f50f5ed83880ad70de56ba7678061b6fa2774b3c34d0c028a62b5449602715c6e564103141";
			const res = await obj.addSolution(arg0, arg1, arg2);
			expect(res).to.be.an('object');
		});

		it('call func removeDelegation with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "0x9730f8d7809100201bb0159aa806d0a8c976f052";
			await assertRevert(obj.removeDelegation(arg0));
		});

		it('call func getFollowers with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "0x493623d5b9f8e6a3962addf4c6ec89836ffd7d1e";
			const res = await obj.getFollowers(arg0);
			res.toString().should.be.equal("");
		});

		it('call func createProposalwithSolution with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "\"F`t)xKhbhhfX-;Tcb/o|wQq&9ZWrr7L}{\\5y/+@H}!&r?7w/egs|,pj>lcUv1C@'LH m`u@hD;!zksyKx^lF*!)nCGo@7L)#@A|h5cNm-{=i4s+qCSG!p$U*iC5PM FCb$F'6PG\"";
			const arg1 = "'-a\"a%W/\')T]]{7^;L/8}/$&;N@u91ijf.O3b\'Pa-tB]TjDN2xl$a*\\[M7OlFFPBA/r&I.P<x68Efn^5c3AM*D_*&yOAdUe%C>$n+Wxpl>70J)U(-}@_@hb0qJ{>U|i{RC5}lL[iST7<\'OE53\'#O{AC6ra20poY)}E/j8!Xm)Y@8_A\"E8R uoNkzoa1am|VOX]1^2,'";
			const arg2 = "\"P&^*>u:FYnN4FJlN(E'X1$mh/14e{ltKuZY2U;(,g6LEt+{*g&1F)qt,R$z,]+477)bAJ4y#Y`5c;2Ui(+(^C7E/_50CNh_'FMIv/9,$#ocz%nuW}Fbf7>>w@q}x:U26BgiWf:)idw{K/;9.wkS5!4}GTTb4Vssou5tJ^]gyS Jh.]z^b}XS8DSc%?5q63=F$LZlUb9d\"";
			const arg3 = "13567141030323495396358047107302819261670439997839031338276361928517155684186";
			const arg4 = "'GAxE<c;1eJRiM7jT($*/gvk&{c0q9-t>NW5*7Phe>i6Y/'";
			const arg5 = "0x3f7606da326d75da61ce84caf0a11bd24d3ba12e333e904225f4df1d09d98d4a09be2842c88cc7a302f5d4d2aae51a367761de533b44f4587b8e333978c65d91dab21fc84b1f3171de8817cbf5e28c6a1454abd12942698a992d4ff8c58188839d3605a99c7b8fb043b86f66ccc3d6f52c68c36abe3bf49c";
			await assertRevert(obj.createProposalwithSolution(arg0, arg1, arg2, arg3, arg4, arg5));
		});

		it('call func updateUintParameters with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "0x5ae58a93238d420e";
			const arg1 = "34986735480573006292383858977626594732819038718920690174461351373030042817675";
			await assertRevert(obj.updateUintParameters(arg0, arg1));
		});

		it('call func canCloseProposal with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "21055003456126480078325193029956041166410573060299165588126173018980927127188";
			await assertRevert(obj.canCloseProposal(arg0));
		});

		it('call func proposalVoteTally with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "72940298825571747983778895299748578620432337268389128575975621315327704908789";
			const res = await obj.proposalVoteTally(arg0);
			res.toString().should.be.equal("0");
		});

		it('call func alreadyDelegated with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Governance.new();
			const arg0 = "0x9e25a1dd4ad0a372e224a624c98fa02e2803e4aa";
			const res = await obj.alreadyDelegated(arg0);
			res.toString().should.be.equal("false");
		});

	});
});