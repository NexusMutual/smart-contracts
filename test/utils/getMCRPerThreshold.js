async function getValue(...args) {
  let vf = args[0];
  let pd = args[1];
  let mcr = args[2];
  let vtp = await mcr.calVtpAndMCRtp();
  let totalSa = await mcr.getAllSumAssurance();
  let mincap = await pd.minCap();
  let val = await mcr.getThresholdValues(vtp[0], vf, totalSa, mincap);

  return Math.floor((val[0] / 1 + val[1] / 1) / 2);
}

module.exports = { getValue };
