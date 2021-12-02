const { toBN } = require("web3-utils");
const { toBytes32, bytesToString, fromUnit, toUnit } = require("../utils");
const { synths } = require("../config/synths");

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy, get, execute, read } = deployments;
  const { deployer, loftOwner } = await getNamedAccounts();

  const addressResolver = await get("AddressResolver");
  const availableCurrencyKeys = await read(
    "Synthesizer",
    "availableCurrencyKeys"
  );
  const currentKeys = availableCurrencyKeys.map((item) => bytesToString(item));

  // add OfUSD,xAUD,xEUR to synth
  for (const synth of synths) {
    const instance = await get(synth.symbol);

    if (!currentKeys.includes(synth.symbol)) {
      await execute(
        "Synthesizer",
        { from: deployer },
        "addSynth",
        instance.address
      );
    }
  }
};
module.exports.tags = ["InitSynth", "Config", "deploy"];
//module.exports.dependencies = ['Synth'];
