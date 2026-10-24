import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptDecrypt,
  signVerify,
  verifySign,
  stableStringify
} from "../API/helpers/utils.js";
import { randomCardNumber } from "../API/helpers/common.js";
import { getBankList, getRandomIFSC } from "../API/helpers/payoutHelper.js";

describe("Enkripsi & Dekripsi AES-CBC (encryptDecrypt)", () => {
  const apiKey = "TEST_API_KEY_12345";
  const secretKey = "TEST_SECRET_KEY_67890";

  it("berhasil melakukan enkripsi dan dekripsi teks string (plain text)", () => {
    const originalText = "merchant_code=TEST_MERCHANT&amount=50000&order_id=ORD-999";
    
    // Encrypt
    const encrypted = encryptDecrypt("encrypt", originalText, apiKey, secretKey, false);
    assert.ok(encrypted, "Hasil enkripsi tidak boleh null/kosong");
    assert.equal(typeof encrypted, "string");
    assert.notEqual(encrypted, originalText);

    // Decrypt
    const decrypted = encryptDecrypt("decrypt", encrypted, apiKey, secretKey, false);
    assert.equal(decrypted, originalText, "Hasil dekripsi harus identik dengan teks asli");
  });

  it("berhasil melakukan enkripsi dan dekripsi objek JSON (isJson = true)", () => {
    const payload = {
      merchant_code: "MERC_ID_01",
      transaction_code: "TRX-TEST-001",
      amount: 150000,
      currency: "IDR",
      nested: {
        bank: "BCA",
        account: "1234567890"
      }
    };

    // Encrypt
    const encrypted = encryptDecrypt("encrypt", payload, apiKey, secretKey, true);
    assert.ok(encrypted, "Hasil enkripsi JSON tidak boleh kosong");
    assert.equal(typeof encrypted, "string");

    // Decrypt
    const decrypted = encryptDecrypt("decrypt", encrypted, apiKey, secretKey, true);
    assert.deepEqual(decrypted, payload, "Hasil dekripsi harus sesuai dengan objek JSON semula");
  });

  it("mengembalikan null untuk action yang tidak valid", () => {
    const res = encryptDecrypt("unknown_action", "data", apiKey, secretKey);
    assert.equal(res, null);
  });

  it("dekripsi dengan key yang salah tidak mengembalikan data yang sama", () => {
    const originalText = "sensitive_data_123";
    const encrypted = encryptDecrypt("encrypt", originalText, apiKey, secretKey, false);
    
    const wrongKey = "WRONG_SECRET_KEY";
    const decryptedWithWrongKey = encryptDecrypt("decrypt", encrypted, apiKey, wrongKey, false);
    assert.notEqual(decryptedWithWrongKey, originalText);
  });
});

describe("HMAC-SHA256 Signature (signVerify & verifySign)", () => {
  const secretKey = "SECRET_SIGNATURE_KEY_ABC";

  it("menghasilkan signature Base64 yang konsisten dan deterministik", () => {
    const data = {
      order_id: "ORD-12345",
      amount: 50000,
      currency: "VND"
    };

    const signature1 = signVerify("sign", data, secretKey);
    const signature2 = signVerify("sign", data, secretKey);

    assert.ok(signature1, "Signature tidak boleh kosong");
    assert.equal(typeof signature1, "string");
    assert.equal(signature1, signature2, "Signature untuk data dan key yang sama harus identik");
  });

  it("berhasil memverifikasi payload valid dengan signature yang benar", () => {
    const data = {
      merchant: "SEAPAY",
      transaction_id: "TX-778899",
      amount: 25000
    };

    const signature = signVerify("sign", data, secretKey);
    const isValid = signVerify("verify", { payload: data, signature }, secretKey);

    assert.equal(isValid, true, "Verifikasi signature harus menghasilkan true");
  });

  it("gagal memverifikasi payload yang telah dimanipulasi (tampered)", () => {
    const originalData = {
      merchant: "SEAPAY",
      amount: 1000
    };

    const signature = signVerify("sign", originalData, secretKey);

    const tamperedData = {
      merchant: "SEAPAY",
      amount: 9999999 // Data diubah
    };

    const isValid = signVerify("verify", { payload: tamperedData, signature }, secretKey);
    assert.equal(isValid, false, "Signature harus invalid untuk data yang diubah");
  });

  it("gagal memverifikasi jika secret key berbeda", () => {
    const data = { status: "SUCCESS" };
    const signature = signVerify("sign", data, secretKey);

    const isValid = signVerify("verify", { payload: data, signature }, "ANOTHER_SECRET_KEY");
    assert.equal(isValid, false);
  });

  it("helper verifySign menghasilkan true untuk sign yang valid", () => {
    const content = { code: "DP100", amount: 20000 };
    const sign = signVerify("sign", content, secretKey);

    const result = verifySign(content, sign, secretKey);
    assert.equal(result, true);
  });

  it("mengembalikan null untuk action yang tidak valid", () => {
    const result = signVerify("invalid", {}, secretKey);
    assert.equal(result, null);
  });
});

describe("Deterministic JSON Stringify (stableStringify)", () => {
  it("menghasilkan string identik meskipun urutan key properti berbeda", () => {
    const objA = { b: 2, a: 1, c: 3 };
    const objB = { c: 3, b: 2, a: 1 };
    const objC = { a: 1, b: 2, c: 3 };

    const strA = stableStringify(objA);
    const strB = stableStringify(objB);
    const strC = stableStringify(objC);

    assert.equal(strA, strB);
    assert.equal(strB, strC);
    assert.equal(strA, '{"a":1,"b":2,"c":3}');
  });

  it("mengurutkan key pada objek bersarang (nested object) secara konsisten", () => {
    const obj1 = {
      z: { y: 2, x: 1 },
      m: "test"
    };
    const obj2 = {
      m: "test",
      z: { x: 1, y: 2 }
    };

    assert.equal(stableStringify(obj1), stableStringify(obj2));
  });

  it("menangani tipe data primitif dan null", () => {
    assert.equal(stableStringify("hello"), '"hello"');
    assert.equal(stableStringify(123), "123");
    assert.equal(stableStringify(null), "null");
  });
});

describe("randomCardNumber Helper", () => {
  it("menghasilkan string sepanjang 16 digit dan tidak hilang presisi", () => {
    for (let i = 0; i < 20; i++) {
      const card = randomCardNumber();
      assert.equal(typeof card, "string", "Tipe data harus selalu string");
      assert.equal(card.length, 16, "Panjang kartu harus tepat 16 digit");
      assert.match(card, /^[1-9]\d{15}$/, "Harus terdiri dari 16 angka dan digit pertama bukan 0");
    }
  });
});

describe("Bank List In-Memory Caching", () => {
  it("memuat list bank ke memori dan panggilan berikutnya memanfaatkan cache", async () => {
    const banks1 = await getBankList();
    assert.ok(Array.isArray(banks1), "Harus mengembalikan array bank");
    assert.ok(banks1.length > 0, "Array bank tidak boleh kosong");

    // Second call should return cached instance immediately
    const banks2 = await getBankList();
    assert.equal(banks1, banks2, "Panggilan kedua harus mengembalikan referensi cache yang sama");
  });

  it("getRandomIFSC mengembalikan kode IFSC valid", async () => {
    const ifsc = await getRandomIFSC();
    assert.ok(ifsc, "IFSC code harus ada");
    assert.equal(typeof ifsc, "string");
    assert.ok(ifsc.length >= 4, "Panjang IFSC minimal 4 karakter");
  });
});
