async function getValue (vf, pd, mcr) {
  const vtp = await mcr.calVtpAndMCRtp();
  const totalSa = await mcr.getAllSumAssurance();
  const mincap = await pd.minCap();
  const val = await mcr.getThresholdValues(vtp[0], vf, totalSa, mincap);
  return Math.floor((val[0] / 1 + val[1] / 1) / 2);
}

module.exports = { getValue };
