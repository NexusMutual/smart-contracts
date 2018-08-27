const Pool1 = artifacts.require('Pool1');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationData = artifacts.require('QuotationData');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('DAI');
const NXMTokenData = artifacts.require('NXMTokenData');
const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const member = web3.eth.accounts[1];
const coverHolder = web3.eth.accounts[4];
const fee = web3.toWei(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const v = 28;
const v_dai = 27;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';
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
let td;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe('Contract: 5_Quotation', function() {
  const BN_100 = new BigNumber(100);
  const BN_5 = new BigNumber(5);
  const BN_20 = new BigNumber(20);
  const BN_95 = new BigNumber(95);
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
        return NXMTokenData.deployed();
      })
      .then(function(instance) {
        td = instance;
      });
  });

  it('should return correct AuthQuoteEngine address', async function() {
    const authQE = await qd.getAuthQuoteEngine();
    authQE.should.equal(QE);
  });

  it('should return correct product name', async function() {
    const pname = await qd.getProductName(PID);
    pname.should.equal(PNAME);
  });

  it('should able to Purchase Cover With Ether', async function() {
    await nxmtk2.payJoiningFee({ from: coverHolder, value: fee });
    const initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    const initialAvailableToken = await cr.getTotalStakeCommission(member);
    const initialPoolBalance = await P1.getEtherPoolBalance();
    const initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
    const initialTokensOfCoverHolder = await td.getBalanceOf(coverHolder);
    const initialTotalSupply = await td.totalSupply();
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
    const newLockedCN = initialLockedCN
      .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    const newAvailableToken = initialAvailableToken
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    const newPoolBalance = initialPoolBalance
      .plus(new BigNumber(coverDetails[1].toString()))
      .toFixed(0);
    const newTotalCA = initialTotalSA.plus(coverDetails[0]);
    const newTokensOfCoverHolder = initialTokensOfCoverHolder.plus(
      new BigNumber(newLockedCN.toString())
    );
    const newTotalSupply = initialTotalSupply
      .plus(new BigNumber(newLockedCN.toString()))
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    newLockedCN.should.be.bignumber.equal(
      await nxmtk2.totalBalanceCNOfUser(coverHolder)
    );
    newAvailableToken.should.be.bignumber.equal(
      await cr.getTotalStakeCommission(member)
    );
    newPoolBalance.should.be.bignumber.equal(await P1.getEtherPoolBalance());
    newTotalCA.should.be.bignumber.equal(await qd.getTotalSumAssured(CA_ETH));
    newTokensOfCoverHolder.should.be.bignumber.equal(
      await td.getBalanceOf(coverHolder)
    );
    newTotalSupply.should.be.bignumber.equal(await td.totalSupply());
  });

  it('should return correct cover details purchased with ether', async function() {
    const CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
    const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
    if (
      cdetails2[1] == CA_ETH &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });

  it('should able to purchase cover with NXM', async function() {
    this.timeout(0);
    await P1.buyTokenBegin({ from: coverHolder, value: tk });
    const initialTokensOfCoverHolder = await nxmtk1.balanceOf(coverHolder);
    const initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    const initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    const initialTotalSupply = await td.totalSupply();
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
    const presentTokensOfCoverHolder = await nxmtk1.balanceOf(coverHolder);
    const presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    const presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    const presentTotalSupply = ((await td.totalSupply()) / 1e18).toFixed(10);
    const newTokensOfCoverHolder = initialTokensOfCoverHolder.minus(
      new BigNumber(coverDetails[2])
    );
    const newLockedCN = initialLockedCN
      .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    const newAvailableToken = initialAvailableToken
      .plus(BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
      .toFixed(0);
    let newTotalSupply = initialTotalSupply.minus(
      new BigNumber(coverDetails[2].toString())
    );
    newTotalSupply = (
      newTotalSupply
        .plus(BN_5.times(new BigNumber(coverDetails[2].toString()).div(BN_100)))
        .plus(
          BN_20.times(new BigNumber(coverDetails[2].toString()).div(BN_100))
        )
        .toFixed(0) / 1e18
    ).toFixed(10);
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
    newTokensOfCoverHolder.should.be.bignumber.equal(
      presentTokensOfCoverHolder
    );
    newTotalSupply.should.be.bignumber.equal(presentTotalSupply);
  });

  it('should return correct cover details purchased with NXM', async function() {
    const CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[1]);
    const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[1]);
    if (
      cdetails2[1] == CA_ETH &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });

  it('should able to purchase cover using currency assest i.e. DAI ', async function() {
    this.timeout(0);
    await cad.transfer(coverHolder, tk);
    const initialLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    const initialCAbalance = await cad.balanceOf(coverHolder);
    const initialAvailableToken = await cr.getTotalStakeCommission(member); // member=staker for smart contract
    const initialPoolBalanceOfCA = await cad.balanceOf(P1.address);
    const presentaCAbalance = await cad.balanceOf(coverHolder);
    const initialTotalSupply = await td.totalSupply();
    await cad.approve(P1.address, coverDetailsDai[1], { from: coverHolder });
    await P1.makeCoverUsingCA(
      PID,
      smartConAdd,
      'DAI',
      coverDetailsDai,
      coverPeriod,
      v_dai,
      r_dai,
      s_dai,
      { from: coverHolder }
    );
    const presentLockedCN = await nxmtk2.totalBalanceCNOfUser(coverHolder);
    const presentCAbalance = await cad.balanceOf(coverHolder);
    const presentAvailableToken = await cr.getTotalStakeCommission(member); // staker should get 20% of premium.
    const presentPoolBalanceOfCA = await cad.balanceOf(P1.address);
    const presentTotalSupply = await td.totalSupply();
    const newLockedCN = initialLockedCN
      .plus(
        BN_5.times(new BigNumber(coverDetailsDai[2].toString()).div(BN_100))
      )
      .toFixed(0);
    const newAvailableToken = initialAvailableToken
      .plus(
        BN_20.times(new BigNumber(coverDetailsDai[2].toString()).div(BN_100))
      )
      .toFixed(0);
    const newTotalSupply = initialTotalSupply
      .plus(new BigNumber(newLockedCN - initialLockedCN))
      .plus(newAvailableToken - initialAvailableToken)
      .toFixed(0);
    presentCAbalance.should.be.bignumber.equal(
      initialCAbalance.minus(new BigNumber(coverDetailsDai[1].toString()))
    );
    presentPoolBalanceOfCA.should.be.bignumber.equal(
      initialPoolBalanceOfCA.plus(new BigNumber(coverDetailsDai[1].toString()))
    );
    newLockedCN.should.be.bignumber.equal(presentLockedCN);
    newAvailableToken.should.be.bignumber.equal(presentAvailableToken);
    newTotalSupply.should.be.bignumber.equal(presentTotalSupply);
  });

  it('should return correct cover details purchased with DAI', async function() {
    const CID = await qd.getAllCoversOfUser(coverHolder);
    let checkd = false;
    const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[2]);
    const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[2]);
    if (
      cdetails2[1] == CA_DAI &&
      cdetails1[1] == PNAME &&
      cdetails1[2] == coverHolder &&
      cdetails1[3] == smartConAdd
    ) {
      checkd = true;
    }
    checkd.should.equal(true);
  });
});
