// This is the automatically generated test file for contract: ProposalCategory
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const ProposalCategory = artifacts.require('ProposalCategory');
const {assertRevert} = require('./utils/assertRevert');

contract('ProposalCategory', (accounts) => {
	// Coverage imporvement tests for ProposalCategory
	describe('ProposalCategoryBlackboxTest', () => {
		it('call func categoryActionDetails with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "47509664389442843477775967605108857405646803624887729026470284308407408194846";
			const res = await obj.categoryActionDetails(arg0);
			expect(res).to.be.an('object');
		});

		it('call func updateCategory with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "15915375746220197535307861210154267709992629832189783496718704893643190016849";
			const arg1 = "'dXp2xhCO5RiTQ7,NXp?4q2&{sHojra5T@'";
			const arg2 = "48409311612675681723271481581346780700788063076202390866808528706711122031924";
			const arg3 = "79065795043073223208899600811227064245672722556924226008253167069558662380413";
			const arg4 = "82373502831103736070969826842172820180929189347818594807327307032317314248775";
			const arg5 = ["27581206365086977431423440485739504911680675485945170243497798611501780565395"];
			const arg6 = "22799325553842856143403236183161326357594552968154374609975245795546383885029";
			const arg7 = "'Nd|OSG.2H<{Vs@Q*2Sf\\&uf]\\2B>?\"'";
			const arg8 = "0x51793b07bbcba815f9145c918f57d4785594eac3";
			const arg9 = "0x715d";
			const arg10 = ["40090002867912816893605260993360413765923626591658615131123056133320114486474"];
			await assertRevert(obj.updateCategory(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10));
		});

		it('call func changeDependentContractAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			await assertRevert(obj.changeDependentContractAddress());
		});

		it('call func updateCategoryActionHashes with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			await assertRevert(obj.updateCategoryActionHashes());
		});

		it('call func editCategory with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "42671250279046160478439283899919407243810362288855142966353115514798559409241";
			const arg1 = "'a3GFZ?3(]R&%%YPUI\\RQz!k&\"Lxb6[#3@7vz/9so/jO:m{<A//rsH-W@xyxiKQMQu76W^/>3:R=iuBxgQWktE&9\\vTRgRO:dWe\'*X+$iaB5l\\2U%5=|,qF3\"},6ID!:9.[:\\s;n35S=eRuJnQ0<{(K68,A![V^h{1os391)ZWNw\\zxUNO/)\\.>TVnDB{fee=,8v7W`b]f_Eqznm(Ld^q0FZ+-p.D*t}_YzmPf/[8\\5=`Nmr7R:a]$wk{?,-%,4'";
			const arg2 = "6309147637073544705810611038904640567610564514852652982032069356426826840480";
			const arg3 = "100125165220128772543471005587644607109118100394908713046005251435892424546700";
			const arg4 = "6895940240575534146462917710640085588075616044711404592568935350908509084015";
			const arg5 = ["40191265789076768176929878235911781463442365792996504210992292253727599247397"];
			const arg6 = "111038329556809900177636882438475780000358998091710423343449034734330923483828";
			const arg7 = "'^Lk10}*2)YKpnX0qP\':L?1cbWcMeeu+FCz\"hL_t(o+C67.=\\6Cx!:iM/p@j]PZCbhoZg.z+RA-^Aet&wZ0!o#N!qm=:[XKFhN8L90H ]+|_]2`lQ| `Nk)-<w8m6>f7\"NC%h7i{:+](^Tg6.(,S!}|TmWGTCJah4``\"]g'";
			const arg8 = "0xcc2e9676d395527778a2bb2e4d99bd5c2f6100bc";
			const arg9 = "0x2830";
			const arg10 = ["50355390320575279624753653839197592986624812066653042647585405070184592461296"];
			const arg11 = "'(=&rq e=!K*&c9b<|`>;bZCd\"IW(mY%([-;B:vq%X>1RW<<2-8%8Pto@iv{g:!ALvj-P?;yikC\"4{/z?t|HGA_HLXBs$lz}j,:rG/{67zW(BwM>Lj'";
			await assertRevert(obj.editCategory(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11));
		});

		it('call func nxMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const res = await obj.nxMasterAddress();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func isAuthorizedToGovern with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "0xacd7a4120df8cd18d3c94381f8dc491f010eadff";
			await assertRevert(obj.isAuthorizedToGovern(arg0));
		});

		it('call func changeMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "0x392dc6e0c72d15d1b85805110146329583890382";
			const res = await obj.changeMasterAddress(arg0);
			expect(res).to.be.an('object');
		});

		it('call func categoryAction with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "71023468484266488792179545401608707891785454266371222432088055519588964326752";
			const res = await obj.categoryAction(arg0);
			expect(res).to.be.an('object');
		});

		it('call func addCategory with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await ProposalCategory.new();
			const arg0 = "'Od{%Z9 zE>z\"LV{Zk\'zn|5tx5mAdETeDJV\\6QS tIR`P[Xa^h/W>rQG(@nA:nYVhZ#%Nc7*05;?ZYy4`\\:/\"Bnx1nE$jX;7kc;|DP)v|y_S:T?7R\":lJ#]y07nwp.RW!6?\'qgm'";
			const arg1 = "34819646285261695191271858605740429270451880012910389957639327780579170255075";
			const arg2 = "114819555288392204206169326330006776521835960179865219475152175703888186026551";
			const arg3 = "68298175578665017992506543850789053649021169194023577304791937122897673119366";
			const arg4 = ["111664144184234896553689924935881583702231399793401481728146392930888208107656"];
			const arg5 = "20690083980496984530171210853898545520857453361951854837356954368619736344212";
			const arg6 = "\"+9vRj=ugu&o&c7_O}'75flsuCK-%#KJ.BXA[&BY$x5_>WM1s5mIUG[RPGJ((hII3BdtD#pytIesFHN_!t}AM4Of7AjzD0[(rLB9P1e##YLkoa@J<(?FA0<)<Au293^=;WA^]Udy>C(rt,WtNci8S%tLLxmn+DKr<Xk?PHDw5rPa5%=38pTFw;QZX;TYNz>e:9_K&<:[h8ooE\"";
			const arg7 = "0x43babfea9ddf63fcd54a58f9cd727375ca76fc02";
			const arg8 = "0xc95b";
			const arg9 = ["42215792641224869247018921109812386776346989806260912055599316395032687125731"];
			await assertRevert(obj.addCategory(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9));
		});

	});
});