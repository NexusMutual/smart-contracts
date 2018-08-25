const Pool1 = artifacts.require('Pool1');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationData = artifacts.require('QuotationData');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('DAI');

const member = web3.eth.accounts[1];
const coverHolder = web3.eth.accounts[4];
const fee = web3.toWei(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [5, 1176856034679443, 260712457837714, 7972408607];
const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const v = 27;
const r = '0x30c1449cd8c7e4c25760e3eb31e6f5812efe9622a3db4a525b8f0e53cb749ed9';
const s = '0x11ec3139bf601c2a31bd5e4af8e05b6f9ced428da9f4654ba5feb9018f828ee4';
const r_dai =
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556';
const s_dai =
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff';

let P1;
let nxmtk1;
let nxmtk2;
let cr;
let qd;
let qt;
let cad;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe('Contract: Quotation', function() {
  const BN_100 = new BigNumber(100);
  const BN_5 = new BigNumber(5);
  const BN_20 = new BigNumber(20);
  const tk = new BigNumber(2e18);

  before(function() {
    NXMToken1.deployed()
      .then(function(instance) {
        nxmtk1 = instance;
        return NXMToken2.deployed();
      })
      .then(function(instance) {
        nxmtk2 = instance;
        return ClaimsReward.deployed();
      })
      .then(function(instance) {
        cr = instance;
        return QuotationData.deployed();
      })
      .then(function(instance) {
        qd = instance;
        return Pool1.deployed();
      })
      .then(function(instance) {
        P1 = instance;
        return Quotation.deployed();
      })
      .then(function(instance) {
        qt = instance;
        return DAI.deployed();
      })
      .then(function(instance) {
        cad = instance;
      });
  });

  it('should return correct AuthQuoteEngine address', async function() {
    let authQE = await qd.getAuthQuoteEngine();
    authQE.should.equal(QE);
  });

  it('should return correct product name', async function() {
    let pname = await qd.getProductName(PID);
    pname.should.equal(PNAME);
  });

  it('should return correct product hash', async function() {
    let phash = await qd.getProductHash(PID);
    phash.should.equal(PHASH);
  });

  it('should able to Purchase Cover With Ether', async function() {
    await nxmtk2.payJoiningFee({ from: coverHolder, value: fee });
    let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    let initialPoolBalance = await P1.getEtherPoolBalance();
    await P1.makeCoverBegin(
      PID,
      smartConAdd,
      'ETH',
      coverDetails,
      coverPeriod,
      v,
      r,
      s,
      { from: coverHolder, value: coverDetails[1] }
    );
    let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    let presentPoolBalance = await P1.getEtherPoolBalance();
    let newLockedCN = initialLockedCN
      .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newAvailableToken = initialAvailableToken
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newPoolBalance = initialPoolBalance
      .plus(new BigNumber(coverDetails[1].toString()))
      .toFixed(0);
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
    newPoolBalance.should.be.bignumber.equal(presentPoolBalance);
  });

  it('should return correct cover details purchased with ether', async function() {
    let CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    let cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
    let cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
    if (
      cdetails2[1] == '0x45544800' &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });

  it('should able to purchase cover with NXM', async function() {
    await P1.buyTokenBegin({ from: coverHolder, value: tk });
    let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    await qt.makeCoverUsingNXMTokens(
      PID,
      coverDetails,
      coverPeriod,
      'ETH',
      smartConAdd,
      v,
      r,
      s,
      { from: coverHolder }
    );
    let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    let newLockedCN = initialLockedCN
      .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newAvailableToken = initialAvailableToken
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
  });

  it('should return correct cover details purchased with NXM', async function() {
    let CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    let cdetails1 = await qd.getCoverDetailsByCoverID1(CID[1]);
    let cdetails2 = await qd.getCoverDetailsByCoverID2(CID[1]);
    if (
      cdetails2[1] == '0x45544800' &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });

  it('should able to purchase cover using currency assest i.e. DAI ', async function() {
    await cad.transfer(coverHolder, tk);
    let initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let initialCAbalance = await cad.balanceOf(coverHolder);
    let initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    let initialPoolBalanceOfCA = await cad.balanceOf(P1.address);
    let presentaCAbalance = await cad.balanceOf(coverHolder);
    await cad.approve(P1.address, coverDetailsDai[1], { from: coverHolder });
    await P1.makeCoverUsingCA(
      PID,
      smartConAdd,
      'DAI',
      coverDetailsDai,
      coverPeriod,
      v,
      r_dai,
      s_dai,
      { from: coverHolder }
    );
    let presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    let presentCAbalance = await cad.balanceOf(coverHolder);
    let presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    let presentPoolBalanceOfCA = await cad.balanceOf(P1.address);
    let newLockedCN = initialLockedCN
      .plus(
        BN_5.times(new BigNumber(coverDetailsDai[2].toString()).div(BN_100))
      )
      .toFixed(0);
    let newAvailableToken = initialAvailableToken
      .plus(
        BN_20.times(new BigNumber(coverDetailsDai[2].toString()).div(BN_100))
      )
      .toFixed(0);
    presentCAbalance.should.be.bignumber.equal(
      initialCAbalance.minus(new BigNumber(coverDetailsDai[1].toString()))
    );
    presentPoolBalanceOfCA.should.be.bignumber.equal(
      initialPoolBalanceOfCA.plus(new BigNumber(coverDetailsDai[1].toString()))
    );
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
  });

  it('should return correct cover details purchased with DAI', async function() {
    let CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    let cdetails1 = await qd.getCoverDetailsByCoverID1(CID[2]);
    let cdetails2 = await qd.getCoverDetailsByCoverID2(CID[2]);
    if (
      cdetails2[1] == '0x44414900' &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });
});
