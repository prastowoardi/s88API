import readlineSync from "readline-sync";
import logger from "./API/logger.js";
import { getCurrencyConfig } from "./API/helpers/depositConfigMap.js";
import { registerCustomerJPY, pollKYCStatus, encryptDecrypt } from "./API/helpers/utils.js"; // Pastikan encryptDecrypt di-export di utils

async function manualKYC() {
    console.clear();
    logger.info("========================================");
    logger.info("   🇯🇵 MANUAL KYC JPY DEBUGGER TOOL    ");
    logger.info("========================================");
    
    const config = getCurrencyConfig("JPY");

    // Staging
    // config.BASE_URL = "https://api-dev-p1.paybo.io";
    // config.merchantCode = "SKU20240827065024";
    // config.merchantAPI = "eZHpPLtyPIMTCqyNxbmSPw%3D%3D";
    // config.secretKey = "Y1J05DxNRmHxZRZxECyfF8wloIJcnuXocfupUKNmeb0%3D";
    
    // Production
    config.BASE_URL = "https://pmt-api.next8solution.com";
    config.merchantCode = "SKU20260106031805";
    config.merchantAPI = "wYIRVAjKGxR8haArdrCU%2BQ%3D%3D";
    config.secretKey = "4OXqR1S4qpx8ghK49T%2BN9gZ9X0fUK%2F%2F8narM9DxwQ7o%3D";


    console.log("\n[1] Register New Customer");
    console.log("[2] Poll Existing Status");
    console.log("[3] Full Flow (Register + Poll)");
    
    const choice = readlineSync.question("\nPilih Menu (1/2/3): ");
    let userID = readlineSync.question("Masukkan User ID: ").trim() || "TEST_USER";

    try {
        if (choice === "1" || choice === "3") {
            logger.info(`🚀 [STEP 1] Registering User: ${userID}...`);
            const regRes = await registerCustomerJPY(config, userID);
            
            // Log response mentah jika terjadi error 400/422
            // if (regRes && regRes.success) {
            //     logger.info("✅ Registration Sent Successfully!");
            //     console.log("Data:", JSON.stringify(regRes.data || regRes, null, 2));
            // } else {
            //     logger.error("❌ Registration Failed.");
            //     console.log("Server Response:", JSON.stringify(regRes, null, 2));
            //     if (choice === "3") return; 
            // }
        }

        // --- PROSES POLLING ---
        if (choice === "2" || choice === "3") {
            console.log("\n----------------------------------------");
            logger.info(`🔍 [STEP 2] Polling status for: ${userID}...`);
            
            let attempts = 0;
            const maxAttempts = 5;
            let isApproved = false;

            while (attempts < maxAttempts) {
                attempts++;
                const pollRes = await pollKYCStatus(userID, config);
                
                const resData = pollRes?.data;
                const status = Array.isArray(resData) ? resData[0]?.status : resData?.status;
                const msg = pollRes?.message || "No message";

                logger.info(`[Attempt ${attempts}/${maxAttempts}] Status: ${status || 'UNKNOWN'} | Msg: ${msg}`);

                if (status?.toUpperCase() === "APPROVED") {
                    logger.info("🎉 SUCCESS: KYC has been APPROVED!");
                    isApproved = true;
                    break;
                } else if (status?.toUpperCase() === "REJECTED") {
                    logger.error("🚫 REJECTED: KYC was turned down by server.");
                    break;
                }

                if (attempts < maxAttempts) {
                    logger.info("Waiting 5 seconds for next check...");
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!isApproved && attempts >= maxAttempts) {
                logger.warn("⚠️  Polling finished without Approval (Still Pending).");
            }
        }
    } catch (err) {
        logger.error(`‼️  CRITICAL ERROR: ${err.message}`);
    }
    
    logger.info("================ DONE =================\n");
    process.exit();
}

manualKYC();