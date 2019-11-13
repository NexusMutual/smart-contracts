var _ = require('lodash');
var BN = require('bn.js');
var ethABI = require('ethereumjs-abi');
var util = require('ethereumjs-util');
async function getValue(...args) {
  let vf = args[0];
  let pd = args[1];
  let mcr = args[2];
  let vtp = await mcr.calVtpAndMCRtp();
  let totalSa = await mcr.getAllSumAssurance();
  let mincap = await pd.minCap();
  let val = await mcr.getThresholdValues(vtp[0], vf, totalSa, mincap);
  // console.log(val);
  // console.log(vtp[0],"  ",vf," ",totalSa," ",mincap);
  return parseInt((val[0] / 1 + val[1] / 1) / 2);
}

function bigNumberToBN(value) {
  return new BN(value.toString(), 10);
}

module.exports = { getValue };
