// This is the automatically generated test file for contract: NXMToken
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const NXMToken = artifacts.require('NXMToken');
const {assertRevert} = require('./utils/assertRevert');

contract('NXMToken', (accounts) => {
	// Coverage imporvement tests for NXMToken
	describe('NXMTokenBlackboxTest', () => {
		it('call func name with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMToken.new("0x8cf3fd75455d59295121102ad7370bf8d06d29af", "105318010547933383378187685729170711374613565520669044879449143665565687191971");
			const res = await obj.name();
			res.toString().should.be.equal("NXM");
		});

		it('call func changeOperator with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMToken.new("0xa499ee1b836d36793e161b915b5cf5a9ab2fd726", "56909983753885279896975743449353785612536778178276241325198975606452454183914");
			const arg0 = "0x2f2f2a425abee3b13e36b96f72636c4db308087c";
			const res = await obj.changeOperator(arg0);
			expect(res).to.be.an('object');
		});

		it('call func operator with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMToken.new("0x11da725041cbefd929d053b789763c681d61c51c", "12791147698771601834948220516045633915584814674284466025255284081936197992835");
			const res = await obj.operator();
			res.toString().should.be.equal("0x0000000000000000000000000000000000000000");
		});

		it('call func decreaseAllowance with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await NXMToken.new("0x0847e4a587e5997cf6002dadbdaa8c02fce79f40", "20788608781557788096466706144397438915928542990703554658417294532226324880131");
			const arg0 = "0x007668c2146e3ca1b0e2d5b95ee451159289356e";
			const arg1 = "50181572319255987303679214408244896821071101389784638947024702137055417640135";
			await assertRevert(obj.decreaseAllowance(arg0, arg1));
		});

	});
});