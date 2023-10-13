import { BigNumber, parseEther } from 'ethers/utils';
function timeTillBv(
  previousState,
  supply,
  capital,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, RATCHET_DENOMINATOR, RATCHET_PERIOD },
) {
  // below
  const innerRightB = previousState.eth.mul(supply);
  const innerLeftB = PRICE_BUFFER_DENOMINATOR.sub(PRICE_BUFFER)
    .mul(capital)
    .mul(previousState.nxmB)
    .div(PRICE_BUFFER_DENOMINATOR);
  const innerB = innerLeftB.gt(innerRightB) ? innerLeftB.sub(innerRightB) : BigNumber.from(0);
  const maxTimeOnRatchetB = innerB.eq(0)
    ? BigNumber.from(0)
    : innerB
        .mul(RATCHET_DENOMINATOR)
        .mul(RATCHET_PERIOD)
        .div(capital)
        .div(previousState.nxmB)
        .div(previousState.ratchetSpeed);

  // above
  const innerLeftA = previousState.eth.mul(supply);
  const innerRightA = PRICE_BUFFER_DENOMINATOR.add(PRICE_BUFFER)
    .mul(capital)
    .mul(previousState.nxmA)
    .div(PRICE_BUFFER_DENOMINATOR);
  const innerA = innerLeftA.gt(innerRightA) ? innerLeftA.sub(innerRightA) : BigNumber.from(0);
  const maxTimeOnRatchetA = innerA.eq(0)
    ? BigNumber.from(0)
    : innerA
        .mul(RATCHET_DENOMINATOR)
        .mul(RATCHET_PERIOD)
        .div(capital)
        .div(previousState.nxmA)
        .div(previousState.ratchetSpeed);

  return { maxTimeOnRatchetA, maxTimeOnRatchetB };
}

function calculateTwapAboveForPeriod(
  previousState,
  state,
  timeElapsed,
  timeTillBV,
  capital,
  supply,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER },
) {
  const timeOnRatchet = timeTillBV.gt(timeElapsed) ? timeElapsed : timeTillBV;
  const timeOnBV = timeElapsed.sub(timeOnRatchet);

  const twapOnRatchet = parseEther('1')
    .mul(previousState.eth.mul(state.nxmA).add(state.eth.mul(previousState.nxmA)))
    .mul(timeOnRatchet)
    .div(previousState.nxmA)
    .div(state.nxmA)
    .div(2);

  const twapOnBV = parseEther('1')
    .mul(timeOnBV)
    .mul(capital)
    .mul(PRICE_BUFFER_DENOMINATOR.add(PRICE_BUFFER))
    .div(supply)
    .div(PRICE_BUFFER_DENOMINATOR);

  return twapOnRatchet.add(twapOnBV).mod(BigNumber.from(2).pow(64));
}

function calculateTwapBelowForPeriod(
  previousState,
  state,
  timeElapsed,
  timeTillBV,
  capital,
  supply,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER },
) {
  const timeOnRatchet = timeTillBV.gt(timeElapsed) ? timeElapsed : timeTillBV;
  const timeOnBV = timeElapsed.sub(timeOnRatchet);

  const twapOnRatchet = parseEther('1')
    .mul(previousState.eth.mul(state.nxmB).add(state.eth.mul(previousState.nxmB)))
    .mul(timeOnRatchet)
    .div(previousState.nxmB)
    .div(state.nxmB)
    .div(2);

  const twapOnBV = parseEther('1')
    .mul(timeOnBV)
    .mul(capital)
    .mul(PRICE_BUFFER_DENOMINATOR.sub(PRICE_BUFFER))
    .div(supply)
    .div(PRICE_BUFFER_DENOMINATOR);

  return twapOnRatchet.add(twapOnBV).mod(BigNumber.from(2).pow(64));
}

module.exports = {
  timeTillBv,
  calculateTwapAboveForPeriod,
  calculateTwapBelowForPeriod,
};
