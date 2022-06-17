//import statements
var log4js = require('log4js');
var logger = log4js.getLogger('MyInfoNodeJSConnector');
const CONFIG = require('../common/config');
const requestHandler = require('./requestHandler');
logger.level = CONFIG.DEBUG_LEVEL;

const crypto = require('crypto');
const constant = require('../common/constant');
const jose = require('node-jose');
const srs = require('secure-random-string');

/**
 * Verify JWS
 * 
 * This method takes in a JSON Web Signature and will check against 
 * the public key for its validity and to retrieve the decoded data.
 * This verification is required for the decoding of the access token and 
 * response from Person API
 * 
 * @param {string} compactJWS - Data in JWS compact serialization Format
 * @param {string} jwksUrl - The URL of the JWKS Endpoint to retrieve the public cert
 * @returns {Promise} - Promise that resolve decoded data
 */

module.exports.verifyJWS = async (compactJWS, jwksUrl) => {
  var jwks = await getJwks(jwksUrl);

  try {
    let keyStore = await jose.JWK.asKeyStore(jwks);

    let result = await jose.JWS.createVerify(keyStore).verify(compactJWS);
    let payload = JSON.parse(Buffer.from(result.payload).toString());

    return payload;
  } catch (error) {
    console.error("Error with verifying JWS:", error);
    throw constant.ERROR_VERIFY_JWS;
  }
};

/**
 * Decyption JWE
 * 
 * This method takes in a JSON Web Encrypted object and will decrypt it using the
 * private key. This is required to decrypt the data from Person API
 * 
 * @param {string} compactJWE - Data in compact serialization format - header.encryptedKey.iv.ciphertext.tag
 * @returns {Promise} - Promise that resolve decrypted data
 */

module.exports.decryptJWEWithKey = async (compactJWE, sessionEncKeyPair) => {
  try {
    let keystore = jose.JWK.createKeyStore();
    let jweParts = compactJWE.split("."); // header.encryptedKey.iv.ciphertext.tag
    if (jweParts.length != 5) {
      throw constant.ERROR_INVALID_DATA_OR_SIGNATURE;
    }

    //Session encryption private key should correspond to the session encryption public key passed in to client assertion
    let key = await keystore.add(sessionEncKeyPair.privateKey, "pem");

    let data = {
      "type": "compact",
      "protected": jweParts[0],
      "encrypted_key": jweParts[1],
      "iv": jweParts[2],
      "ciphertext": jweParts[3],
      "tag": jweParts[4],
      "header": JSON.parse(jose.util.base64url.decode(jweParts[0]).toString())
    };

    let result = await jose.JWE.createDecrypt(key).decrypt(data);

    return result.payload.toString();
  } catch (error) {
    throw constant.ERROR_DECRYPT_JWE;
  }
};

/**
 * Generate Key Pair
 * 
 * This method will generate a keypair which consists of a public key and a private key in PEM format.
 * 
 * @returns {Object} - Returns an object which consists of a public key and a private key
 */

module.exports.generateSessionKeyPair = async () => {
  let options = {
    "namedCurve": "P-256",
    "publicKeyEncoding": {
      "type": "spki",
      "format": "pem"
    },
    "privateKeyEncoding": {
      "type": "sec1",
      "format": "pem"
    }
  };

  let sessionKeyPair = crypto.generateKeyPairSync("ec", options);

  return sessionKeyPair;
};

/**
 * Generate Client Assertion
 * 
 * This method will generate the client assertion which is needed as one of the query parameters when calling Token API
 * 
 * @param {string} url - The URL of the Token API
 * @param {string} clientId - Client id provided during onboarding
 * @param {string} privateKey - Your application private key
 * @param {Object} sessionEncKeyPair - A key pair used for encryption which is generated if ENABLE_JWE flag is 'Y'
 * @param {Object} sessionPopKeyPair - A key pair used for signing which is generated if ENABLE_JWS is 'Y'
 * @returns {string} - Returns the client assertion
 */

module.exports.generateClientAssertion = async (url, clientId, privateKey, sessionEncKeyPair, sessionPopKeyPair) => {
  try {
    let now = Math.floor((Date.now() / 1000));

    let payload = {
      "sub": clientId,
      "jti": generateRandomString(40),
      "aud": url,
      "iss": clientId,
      "iat": now,
      "exp": now + 300
    };

    //If ENABLE_JWS is TRUE, add sessionPopKey public key to payload
    if (sessionPopKeyPair) {
      let session_pop_key = (await jose.JWK.asKey(sessionPopKeyPair.publicKey, "pem")).toJSON(true);
      session_pop_key.use = "sig";
      session_pop_key.alg = "ES256";
      payload.session_pop_key = session_pop_key;
    }

    //If ENABLE_JWE is TRUE, add sessionEncKey public key to payload
    if (sessionEncKeyPair) {
      let session_enc_key = (await jose.JWK.asKey(sessionEncKeyPair.publicKey, "pem")).toJSON(true);
      session_enc_key.use = "enc";
      session_enc_key.alg = "ECDH-ES";
      payload.session_enc_key = session_enc_key;
    }

    let jwsKey = await jose.JWK.asKey(privateKey, "pem");
    let jwtToken = await jose.JWS.createSign({ "format": 'compact', "fields": { "typ": 'JWT' } }, jwsKey).update(JSON.stringify(payload)).final();
    logger.info("jwtToken", jwtToken);
    return jwtToken;
  } catch (error) {
    logger.error("generateClientAssertion error", error);
    throw constant.ERROR_GENERATE_CLIENT_ASSERTION;
  }
};

/**
 * Generate Dpop Token
 * 
 * This method generates the Dpop Token which will be used when calling Person API.
 * Note: Dpop Token is not generated in SANDBOX environment.
 * 
 * @param {string} url - The URL of the Person API
 * @param {string} accessToken - The Access Token returned from Token API
 * @param {string} method - The HTTP method used when calling Person API
 * @param {Object} sessionPopKeyPair - A key pair used for signing which is generated if ENABLE_JWS is 'Y'
 * @returns {string} - Returns the Dpop Token
 */

module.exports.generateDpop = async (url, accessToken, method, sessionPopKeyPair) => {
  try {
    let now = Math.floor((Date.now() / 1000));
    let payload = {
      "htu": url,
      "htm": method,
      "jti": generateRandomString(40),
      "nonce": accessToken.cnf.nonce,
      "iat": now,
      "exp": now + 120
    };

    let privateKey = await jose.JWK.asKey(sessionPopKeyPair.privateKey, "pem");
    let jwk = await jose.JWK.asKey(sessionPopKeyPair.publicKey, "pem");
    let jwtToken = await jose.JWS.createSign({ "format": 'compact', "fields": { "typ": 'dpop+jwt', "jwk": jwk } }, { "key": privateKey, "reference": false }).update(JSON.stringify(payload)).final();
    return jwtToken;
  } catch (error) {
    logger.error("generateDpop error", error);
    throw constant.ERROR_GENERATE_DPOP;
  }
};

/**
 * Base64 Encode
 * 
 * This function encodes a string into Base64 URL format.
 * 
 * @param {string} str - The string to be encoded in Base64 URL format 
 * @returns {string} - Returns a string in Base64 URL format.
 */
module.exports.base64URLEncode = (str) => {
  return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * SHA256 Hash
 * 
 * This function hashes a string with the SHA256 algorithm.
 * 
 * @param {string} buffer - The string to be hashed 
 * @returns {string} - Returns a SHA256 hashed string
 */
module.exports.sha256 = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest();
};

function generateRandomString(length) {
  return srs({ alphanumeric: true, length: length ? length : 40 });
}

async function getJwks(jwksUrl) {
  var jwksUrl = new URL(jwksUrl);
  var response = await requestHandler.getHttpsResponse(jwksUrl.hostname, jwksUrl.pathname, null, "GET", null);

  return JSON.parse(response.msg).keys;
}


