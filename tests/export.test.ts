import { initL2 } from "./test_util";
import { web3, CITA, ERC20 } from "../src/lib/server";
import { Common } from "../src/lib/common";

let sessionID =
  "0xb10e19159da9632965a8c46eab4281448bf7ddc7fe5a13cafde752148ff0c9e0";

let addressList = [
  "0xe130251B22914655acb6655c51974F8Fa54a8202",
  "0x4047D347a5B714e3d5587301Ea8EfFC19569b07C",
  "0x91058f952Be65f3f3274E4611DA7CAea010E8881",
  "0x2E8E2dC7Cc544a89cE5f9327c31Dbe5367e138f4",
  "0x85699FB928fE4dB4271B26119536bcA9E8006f7C"
];

// let fromAddress = "0x4Aa670bCe722B9698A670afc968b1dE5f1553df9";
// let privateKey =
//   "DDC1738AC05989633A43A49FB8B9FBE77970CCA9F85921768C2BD8FABBFB2E55";

let fromAddress = "0xa08105d7650Fe007978a291CcFECbB321fC21ffe";
let privateKey =
  "6A22D7D5D87EFC4A1375203B7E54FBCF35FAA84975891C5E3D12BE86C579A6E5";
// let token = "0x3052c3104c32e666666fBEf3A5EAd4603747eA83";
let token = "0x9ac78c85A0d3a86a8BE1e08Bea6Ef2EE1687bE18";
describe("test export", () => {
  it("export", async () => {
    let l2 = await initL2();

    let info = await web3.eth.isSyncing();
    console.log("isSyncing is ", info);

    await Common.Sleep(3000);
    expect(true).toBe(true);

    // let data1 = await l2.getMessagesBySessionID(sessionID);
    // console.log(data1);

    // let data = await l2.exportSessionBytes(sessionID);
    // console.log('data is ', data);
  });

  it("transfer", async () => {
    for (let address of addressList) {
      let data = ERC20.methods
        .transfer(address, "1000000000000000000000")
        .encodeABI();

      await Common.SendEthTransaction(
        fromAddress,
        token,
        0,
        data,
        privateKey
      );
    }
  });
});
