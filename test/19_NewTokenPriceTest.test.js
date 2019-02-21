const MCR = artifacts.require('MCR');
const Pool1 = artifacts.require('Pool1Mock');
const PoolData = artifacts.require('PoolData');
const DAI = artifacts.require('MockDAI');
const NXMToken = artifacts.require('NXMToken');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';

let mcr;
let pd;
let tk;
let p1;
let balance_DAI;
let balance_ETH;
let nxms;
let mr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('MCR', function([owner, notOwner]) {
  before(async function() {
    await advanceBlock();
    mcr = await MCR.deployed();
    tk = await NXMToken.deployed();
    p1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
    nxms = await NXMaster.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
  });

  describe('Token Price Calculation', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      await mr.payJoiningFee(notOwner, {
        from: notOwner,
        value: 2000000000000000
      });
      await mr.kycVerdict(notOwner, true);
      await mcr.addMCRData(
        50,
        1000 * 1e18,
        await web3.eth.getBalance(p1.address),
        ['0x455448', '0x444149'],
        [100, 15517],
        20190219
      );

      await pd.changeGrowthStep(1500000);
      await pd.changeSF(140);
    });
    it('single tranche 900', async function() {
      let x = await tk.balanceOf(notOwner);
      await p1.buyToken({ from: notOwner, value: 1260000029573064060 });
      let y = await tk.balanceOf(notOwner);
      console.log('single tranche 900 ==> ', parseFloat(y - x));
      (y - x).should.be.bignumber.equal(900 * 1e18);
    });
    it('double tranches 1100 = 1000+100', async function() {
      let x = await tk.balanceOf(notOwner);
      await p1.buyToken({
        from: notOwner,
        value: 1540000043071691906.6666666666667
      });
      let y = await tk.balanceOf(notOwner);
      console.log('double tranches 1100 = 1000+100 ==> ', parseFloat(y - x));
    });
    it('multiple tranches 5500 = 1000+1000+1000+1000+1000+500', async function() {
      let x = await tk.balanceOf(notOwner);
      await p1.buyToken({
        from: notOwner,
        value: 7700000384546460466.6666666666668
      });
      let y = await tk.balanceOf(notOwner);
      console.log(
        'multiple tranches 5500 = 1000+1000+1000+1000+1000+500 ==> ',
        parseFloat(y - x)
      );
    });
  });
});
