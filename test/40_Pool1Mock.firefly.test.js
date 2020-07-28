// This is the automatically generated test file for contract: Pool1Mock
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const Pool1Mock = artifacts.require('Pool1Mock');
const {assertRevert} = require('./utils/assertRevert');

contract('Pool1Mock', (accounts) => {
	// Coverage imporvement tests for Pool1Mock
	describe('Pool1MockBlackboxTest', () => {
		it('call func burnFrom with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool1Mock.new();
			const arg0 = "0xc8bf3030fac6cd11dfce84fd8e13be1751be6f80";
			const arg1 = "51981400485029636672388488847341560449143949780382747201377489571407683768120";
			await assertRevert(obj.burnFrom(arg0, arg1));
		});

		it('call func burnStakerLockedToken with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool1Mock.new();
			const arg0 = "97735620315966422331511309934772612539005382187534948848464016011294873587351";
			const arg1 = "0x8e4e2885";
			const arg2 = "12853055588312960797597707770721980229100165868977548809484816318578950846809";
			await assertRevert(obj.burnStakerLockedToken(arg0, arg1, arg2));
		});

		it('call func changeMasterAddress with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool1Mock.new();
			const arg0 = "0xb35dfb8e873aa4c62fedb9a57edc49d1764e3d37";
			const res = await obj.changeMasterAddress(arg0);
			expect(res).to.be.an('object');
		});

		it('call func depositCN with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool1Mock.new();
			const arg0 = "109980450597582443215782614620060114351173938343400111047727023576647860738483";
			await assertRevert(obj.depositCN(arg0));
		});

		it('call func __callback with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool1Mock.new();
			const arg0 = "0x4c73c02448c5c6c57bb91709b9e67ca8512ebcdf2442b4fd258283444dd290aa";
			const arg1 = "'{}Gu#T|{{`TMSCS%YMIgj^UK[08<3*oWN|\'}H214R7<v.*Lo.!LQ_iG^,^ow+by)R1r<\"G[6F=;Hxu)*+X+X8c4VT\\WC5_|66x,R,`!Rt]w3d&`V!):.+(w7-:^PyelNpQU5eelsP%-6[;oWl$Vk\\$d2$Yv&<zjHJwEIFH@&Gi_;akY2,DSMWX)nR>{KdAl/nAQ|H=)!G(<Bp4Cl_*4c<WOaQ<?xlFyU,`*^)75ck'";
			const arg2 = "0x3a23714788d0fd79adc621bf7d3aa30869aa7c63805481260ecb275da3d2ad1694547127cdfada30229ab98b2627cc20d5f44eac52e2f280d7df40bc3516d8a3ef3e6b30bab3bb1d3c2370b90a5900e684c20a149d751fbe6ca1f854e1bba48ed65478f6da16aa4cc340ba307fd1fb7a4cf6d07d8877f5352ed0489c16b5494bc1e378a56093885a50ea8957c02755e418558040856805ee3fc903474ea55cd24c70fbbcc5ccaa1196f11578777a273cebc6a2e4686e63fc75d10f55c2963393e6079af72cc41d15899c14cce6bfe9f9ea70";
			const res = await obj.__callback(arg0, arg1, arg2);
			expect(res).to.be.an('object');
		});

		it('call func sellNXMTokens with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await Pool1Mock.new();
			const arg0 = "107608201356243731125152277225871289161554412728842240590486799452686526847554";
			await assertRevert(obj.sellNXMTokens(arg0));
		});

	});
});