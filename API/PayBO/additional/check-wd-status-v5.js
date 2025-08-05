import readlineSync from "readline-sync";
import axios from "axios";
import logger from "../../logger.js";
import { signVerify } from "../../helpers/utils.js";
import { getPayoutConfig } from "../../helpers/payoutConfigMap.js";


async function cheeckWDRequest() { 
    logger.info("======== Check Withdraw V5 Request ========");

    const currency = readlineSync.question("Masukkan Currency (INR/VND/BDT/MMK/BRL/THB/IDR/MXN/KRW/PHP): ").toUpperCase();
    if (!["INR", "VND", "BDT", "MMK", "BRL", "IDR", "THB", "MXN", "KRW", "PHP"].includes(currency)) {
        logger.error("❌ Invalid currency. Masukkan INR, VND, BDT, MMK, BRL, THB, MXN, KRW, PHP atau IDR.");
        return;
    }

    const config = getPayoutConfig(currency);

    const requestNo = readlineSync.question("Masukkan request_no: ");
    const req = {request_no: requestNo};

    const signature = signVerify("sign", req, config.secretKey);

    logger.info(`URL : ${config.BASE_URL}/api/${config.merchantCode}/v5/checkWDRequestStatus`);
    logger.info(`Merchant Code : ${config.merchantCode}`);
    logger.info(`Secret Key : ${config.secretKey}`)
    logger.info(`Request Payload : ${JSON.stringify(req)}`);
    logger.info(`Signature: ${signature}`);

    const isValid = signVerify("verify", {
        payload: req,
        signature: signature
    }, config.secretKey);

    if (isValid) {
        logger.info("✅ VALID SIGN");
    } else {
        logger.info("❌ INVALID SIGN !");
    }

    try {
        const response = await axios({
            method: "GET",
            url: `${config.BASE_URL}/api/${config.merchantCode}/v5/checkWDRequestStatus`,
            headers: {
                "Content-Type": "application/json",
                "sign": signature
            },
            data: req
        });

        const cekTrx = response.data;

        if (response.status !== 200) {
            logger.error("❌ Cek Transaksi gagal:\n" + JSON.stringify(cekTrx, null, 2));
            return;
        }

        logger.info("Response: " + JSON.stringify(cekTrx, null, 2));
        logger.info(`Response Status: ${response.status}`);
    } catch (err) {
        logger.error(`❌ Cek Transaksi Error: ${err}`);
    }


    logger.info("======== REQUEST DONE ========\n\n");
}

cheeckWDRequest();