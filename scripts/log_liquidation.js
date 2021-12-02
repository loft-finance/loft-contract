const {
  toBytes32,
  bytesToString,
  fromUnit,
  toUnit,
  currentTime,
} = require("../utils");
const { synths } = require("../config/synths");

(async () => {
  const { deploy, get, execute, read } = deployments;

  const { deployer, ...args } = await getNamedAccounts();
  const [account1, account2, account3] = await getUnnamedAccounts();
  const accounts = [account1, account2, account3];
  const nowTime = await currentTime();

  const liquidationRatio = await read("Liquidations", {}, "liquidationRatio");
  console.log("liquidationRatio:", liquidationRatio.toString());

  const collateralisationRatio = await read(
    "Synthesizer",
    {},
    "collateralisationRatio",
    "0x74C7e3b3a512eEe056E129b9eC919D6A3fb2E93F"
  );
  console.log(
    "collateralisationRatio:",
    collateralisationRatio.toString(),
    toUnit(0).toString()
  );
  console.log(fromUnit(collateralisationRatio.toString()));
  console.log(fromUnit(liquidationRatio.toString()));
  const u =
    fromUnit(collateralisationRatio.toString()) >=
    fromUnit(liquidationRatio.toString());
  console.log(u);
})();
